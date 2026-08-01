import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compareSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Provider } from "next-auth/providers";
import type { UserRole } from "@prisma/client";
import { normalizePhone } from "@/lib/normalize";
import { TAICHUNG_LINE_SESSION_COOKIE, verifyTaichungLineSession } from "@/lib/line-oauth/taichung-session";
import { repairCustomerIdentityOnLogin } from "@/lib/identity-repair";
import {
  logLineBindEvent,
} from "@/lib/line-bind-log";
import { syncVerifiedCentralIdentity } from "@/server/services/sync-verified-central-identity";
import { cookies } from "next/headers";
import {
  ACCOUNT_LINK_COOKIE,
  verifyAccountLinkHandshake,
} from "@/lib/account-link-handshake";
import { linkVerifiedOAuthAccount } from "@/server/services/link-oauth-account";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

// ============================================================
// NextAuth v5 type augmentation
// ============================================================

declare module "next-auth" {
  interface User {
    role: UserRole;
    staffId: string | null;
    customerId: string | null;
    storeId: string | null;
    storeSlug: string | null;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string | null;
      role: UserRole;
      staffId: string | null;
      customerId: string | null;
      storeId: string | null;
      storeSlug: string | null;
    };
  }
}

interface AppJWT {
  sub?: string;
  role: UserRole;
  staffId: string | null;
  customerId: string | null;
  storeId: string | null;
  storeSlug: string | null;
}

interface LineUserInfoProfile {
  userId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
}

// ============================================================
// NextAuth config
// ============================================================

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // 不使用 PrismaAdapter — OAuth 帳號管理由 signIn callback 手動處理
  // 若使用 adapter + 自訂 signIn callback 會造成 User/Account 重複建立衝突
  session: { strategy: "jwt" },

  providers: [
    // ── Staff 登入（Email + 密碼）──
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "密碼", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            status: true,
            staff: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
            customer: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
          },
        });

        if (!user || !user.passwordHash) return null;
        if (user.status !== "ACTIVE") return null;

        const valid = compareSync(password, user.passwordHash);
        if (!valid) return null;

        // ADMIN 是平台管理者，不綁定任何 store — storeId/staffId 永遠為 null
        if (user.role === "ADMIN") {
          return {
            id: user.id,
            name: user.name,
            email: user.email ?? null,
            role: user.role,
            staffId: null,
            customerId: null,
            storeId: null,
            storeSlug: null,
          };
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? null,
          role: user.role,
          staffId: user.staff?.id ?? null,
          customerId: user.customer?.id ?? null,
          storeId: user.staff?.storeId ?? user.customer?.storeId ?? null,
          storeSlug: user.staff?.store?.slug ?? user.customer?.store?.slug ?? null,
        };
      },
    }),

    // ── 顧客登入（手機 + 密碼）──
    // B7-4: 加入 storeId credential，依店查詢顧客
    Credentials({
      id: "customer-phone",
      name: "customer-phone",
      credentials: {
        phone: { label: "手機", type: "tel" },
        password: { label: "密碼", type: "password" },
        storeId: { label: "Store", type: "hidden" },
      },
      async authorize(credentials) {
        const phoneRaw = credentials?.phone as string | undefined;
        const password = credentials?.password as string | undefined;
        const storeId = credentials?.storeId as string | undefined;

        if (!phoneRaw || !password) return null;
        // 統一吸成 09xxxxxxxx；DB 存的也是 09xxxxxxxx
        const phone = normalizePhone(phoneRaw);
        if (!phone) return null;

        // B7-4: 若有 storeId，從該店 Customer 解析其唯一的中央 User。
        // CustomerIdentityLink is the ownership truth for additional stores.
        if (storeId) {
          const resolution = await resolveCentralUserForStoreCustomer({
            storeId,
            phone,
          });
          if (resolution.status !== "resolved") return null;

          const { customer, user: centralUser } = resolution;
          if (
            centralUser.role !== "CUSTOMER" ||
            centralUser.status !== "ACTIVE" ||
            !centralUser.passwordHash
          ) return null;
          if (!compareSync(password, centralUser.passwordHash)) return null;

          const identitySync = await syncVerifiedCentralIdentity({
            entryPoint: "phone_password",
            userId: centralUser.id,
            storeId: customer.storeId,
            customerId: customer.id,
            provider: "phone",
            providerAccountId: phone,
            verifiedPhoneMatches: true,
          });
          if (
            identitySync.status === "manual_review" ||
            identitySync.status === "rejected"
          ) {
            console.warn("[auth][customer-phone] central identity rejected", {
              userId: centralUser.id,
              storeId: customer.storeId,
              customerId: customer.id,
              reason: identitySync.reason,
            });
            return null;
          }

          // Defensive identity repair: if any other Customer in the same store
          // matches by phone/email but lost its userId binding, rebind it.
          // 99% of the time this is a no-op (the Customer we just authenticated
          // against is already correctly bound). Best-effort — never blocks login.
          // The legacy repair writes Customer.userId.  Do not run it for a
          // second-store membership resolved through CustomerIdentityLink,
          // because User.customer is intentionally one-to-one.
          if (customer.hasDirectUser) {
            await repairCustomerIdentityOnLogin({
              userId: centralUser.id,
              storeId: customer.storeId,
              phone,
              email: centralUser.email ?? null,
            });
          }

          return {
            id: centralUser.id,
            name: centralUser.name,
            email: centralUser.email ?? null,
            role: centralUser.role,
            staffId: null,
            customerId: customer.id,
            storeId: customer.storeId,
            storeSlug: customer.store?.slug ?? null,
          };
        }

        // Fallback（無 storeId）：舊流程 — 全域查 User
        const user = await prisma.user.findFirst({
          where: { phone, role: "CUSTOMER" },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            status: true,
            customer: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
          },
        });

        if (!user || !user.passwordHash) return null;
        if (user.status !== "ACTIVE") return null;

        const valid = compareSync(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? null,
          role: user.role,
          staffId: null,
          customerId: user.customer?.id ?? null,
          storeId: user.customer?.storeId ?? null,
          storeSlug: user.customer?.store?.slug ?? null,
        };
      },
    }),

    // Taiwan's custom callback exchanges LINE tokens itself, then this
    // one-time, HttpOnly-cookie bridge mints the normal Auth.js JWT.  It never
    // reads or creates the legacy global `Account(provider=line)` record.
    Credentials({
      id: "line-taichung-coordinator",
      name: "line-taichung-coordinator",
      credentials: {},
      async authorize(_credentials, request) {
        const rawCookie = request.headers.get("cookie")
          ?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${TAICHUNG_LINE_SESSION_COOKIE}=`))?.slice(TAICHUNG_LINE_SESSION_COOKIE.length + 1);
        const bridge = verifyTaichungLineSession(rawCookie);
        if (!bridge) return null;
        const claimed = await prisma.lineOAuthAttempt.updateMany({
          where: {
            id: bridge.attemptId,
            status: "CONSUMED",
            sessionConsumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { sessionConsumedAt: new Date() },
        });
        if (claimed.count !== 1) return null;
        const resolution = await resolveCentralUserForStoreCustomer({
          customerId: bridge.customerId,
          storeId: bridge.storeId,
        });
        if (resolution.status !== "resolved") return null;

        const { customer, user } = resolution;
        if (
          user.id !== bridge.userId ||
          user.role !== "CUSTOMER" ||
          user.status !== "ACTIVE"
        ) return null;

        return { id: user.id, name: user.name, email: user.email ?? null, role: user.role, staffId: null, customerId: customer.id, storeId: customer.storeId, storeSlug: customer.store.slug };
      },
    }),

    // ── Google OAuth ──
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),

    // ── LINE Login (手動 OAuth) ──
    // LINE 與 Auth.js 不相容處：
    //   1. token endpoint 需要 client_secret_post（預設是 client_secret_basic）
    //   2. token response 可能缺少 token_type — 需要 conform 補上
    //   3. userinfo (/v2/profile) 回傳 userId/displayName/pictureUrl（非標準 OIDC）
    {
      id: "line",
      name: "LINE",
      type: "oauth" as const,
      clientId: process.env.LINE_LOGIN_CHANNEL_ID!,
      clientSecret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
      // LINE 要求 state 參數；不使用 PKCE（LINE 不支援）
      checks: ["state"],
      // 告訴 oauth4webapi 用 client_secret_post（把 client_id/secret 放在 POST body）
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      authorization: {
        url: "https://access.line.me/oauth2/v2.1/authorize",
        params: {
          // 只用 profile — 不要 openid（會導致 LINE 回傳 id_token，
          // 而 oauth4webapi 即使 requireIdToken=false 仍會驗證 id_token 的 issuer，
          // 我們的 fake issuer "https://authjs.dev" 與 LINE 的 "https://access.line.me" 不符會失敗）。
          // 用戶資訊透過 /v2/profile 取得，不需要 id_token。
          scope: "profile",
        },
      },
      token: {
        url: "https://api.line.me/oauth2/v2.1/token",
        // conform: 若 LINE 沒回傳 token_type，補上 "bearer" 讓 oauth4webapi 通過驗證
        async conform(response: Response) {
          const cloned = response.clone();
          const body = await cloned.json();
          if (!body.token_type && body.access_token) {
            return Response.json(
              { ...body, token_type: "bearer" },
              { status: response.status, headers: response.headers }
            );
          }
          return response;
        },
      },
      // 手動 userinfo — LINE /v2/profile 回傳 userId/displayName/pictureUrl
      // userinfo.request 在 type:"oauth" 時會被 Auth.js 呼叫
      userinfo: {
        url: "https://api.line.me/v2/profile",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const res = await fetch("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`LINE profile error ${res.status}: ${JSON.stringify(body)}`);
          }
          return await res.json();
        },
      },
      allowDangerousEmailAccountLinking: true,
      profile(profile: LineUserInfoProfile) {
        return {
          id: profile.userId,
          name: profile.displayName ?? "LINE 用戶",
          email: null, // LINE 預設不提供 email
          image: profile.pictureUrl ?? null,
          role: "CUSTOMER" as UserRole,
          staffId: null,
          customerId: null,
          storeId: null,
          storeSlug: null,
        };
      },
    } satisfies Provider,

    // ── LIFF Session bootstrap (PR-B) ──
    // LIFF webview 內透過 LINE idToken 換 NextAuth session。
    //
    // 安全：authorize() 內 *再做一次* idToken verify (即使 /api/liff/exchange
    // 已經驗過)，這層是真正的 NextAuth 安全邊界。任何呼叫 signIn("liff-token", ...)
    // 的程式碼，無論在哪 (server action / route handler / 直打 callback URL)，
    // 都會走過這個 authorize()。LINE verify 是 stateless GET ~150ms 可接受。
    //
    // 不接受 client 傳的 lineUserId/storeId — 全部從 verify 後的 payload + slug
    // 重新解析。
    Credentials({
      id: "liff-token",
      name: "liff-token",
      credentials: {
        idToken: { label: "LIFF idToken", type: "text" },
        storeSlug: { label: "Store slug", type: "text" },
      },
      async authorize(credentials) {
        const idToken = credentials?.idToken as string | undefined;
        const storeSlug = credentials?.storeSlug as string | undefined;
        if (!idToken || !storeSlug) return null;

        const expectedChannelId = process.env.LINE_LOGIN_CHANNEL_ID;
        if (!expectedChannelId) {
          console.error("[auth][liff-token] LINE_LOGIN_CHANNEL_ID env not set");
          return null;
        }

        const { verifyLiffIdToken, LiffIdTokenError } = await import(
          "@/lib/liff/verify-id-token"
        );

        let verified;
        try {
          verified = await verifyLiffIdToken(idToken, expectedChannelId);
        } catch (err) {
          if (err instanceof LiffIdTokenError) {
            console.warn("[auth][liff-token] idToken verify failed", {
              code: err.code,
              message: err.message,
            });
          } else {
            console.error("[auth][liff-token] unexpected verify error", err);
          }
          return null;
        }

        const { resolveStoreBySlug } = await import("@/lib/store-resolver");
        const store = await resolveStoreBySlug(storeSlug);
        if (!store) {
          console.warn("[auth][liff-token] storeSlug not found", { storeSlug });
          return null;
        }

        const identityLink = await prisma.customerIdentityLink.findUnique({
          where: {
            uq_customer_identity_provider_store: {
              provider: "line",
              providerAccountId: verified.lineUserId,
              storeId: store.id,
            },
          },
          select: {
            customer: {
              select: {
                id: true,
                storeId: true,
                store: { select: { slug: true } },
              },
            },
            user: {
              select: { id: true, name: true, email: true, role: true, status: true },
            },
          },
        });

        // Customer 必須先以同店 identity link 命中；legacy fallback 才看
        // Customer(storeId, lineUserId, userId)。
        const customer = identityLink
          ? {
              ...identityLink.customer,
              user: identityLink.user,
            }
          : await prisma.customer.findFirst({
              where: { storeId: store.id, lineUserId: verified.lineUserId },
              select: {
                id: true,
                storeId: true,
                store: { select: { slug: true } },
                user: {
                  select: { id: true, name: true, email: true, role: true, status: true },
                },
              },
            });

        if (!customer || !customer.user || customer.user.status !== "ACTIVE") {
          // race condition：exchange route 確認過後 customer 被解綁；視為認證失敗
          console.warn("[auth][liff-token] customer not found or inactive", {
            storeId: store.id,
            lineUserId: verified.lineUserId,
          });
          return null;
        }

        // 員工帳號不該透過 LIFF 登入（與 OAuth signIn callback line 313-321 同理）
        if (customer.user.role !== "CUSTOMER") {
          console.warn("[auth][liff-token] non-customer role blocked", {
            userId: customer.user.id,
            role: customer.user.role,
          });
          return null;
        }

        return {
          id: customer.user.id,
          name: customer.user.name,
          email: customer.user.email ?? null,
          role: customer.user.role,
          staffId: null,
          customerId: customer.id,
          storeId: customer.storeId,
          storeSlug: customer.store?.slug ?? null,
        };
      },
    }),
  ],

  callbacks: {
    // ── OAuth account linking ──
    async signIn({ user, account }) {
      try {
        // Skip for Credentials providers
        if (!account || (account.type !== "oauth" && account.type !== "oidc")) return true;

        const provider = account.provider; // "google" or "line"

        // Account settings uses a separately signed, short-lived HttpOnly
        // handshake. It is issued only to an authenticated CUSTOMER and binds
        // the verified OAuth identity back to that exact central User. This
        // branch deliberately runs before normal store/customer resolution so
        // linking can never create, move, or merge a store membership.
        if (provider === "google" || provider === "line") {
          const cookieStore = await cookies();
          const rawHandshake = cookieStore.get(ACCOUNT_LINK_COOKIE)?.value;
          const handshake = await verifyAccountLinkHandshake(
            rawHandshake,
            provider,
          );
          if (handshake) {
            cookieStore.delete(ACCOUNT_LINK_COOKIE);
            const linked = await linkVerifiedOAuthAccount({
              targetUserId: handshake.userId,
              provider,
              account,
              replace: handshake.intent === "replace",
            });
            if (linked.status === "rejected") {
              return `/profile?link=conflict&provider=${provider}`;
            }
            user.id = handshake.userId;
            return true;
          }
          // A browser that entered linking mode must never silently fall back
          // to the normal OAuth sign-in/onboarding path. Expired, tampered, or
          // provider-mismatched handshakes fail closed with zero account write.
          if (rawHandshake) {
            cookieStore.delete(ACCOUNT_LINK_COOKIE);
            return "/profile?link=expired";
          }
        }

        // Get OAuth profile info
        const oauthEmail = user.email;
        const oauthName = user.name ?? "顧客";
        const oauthImage = user.image;
        const lineUserId = provider === "line" ? account.providerAccountId : null;
        const googleId = provider === "google" ? account.providerAccountId : null;
        const existingLineAccount =
          provider === "line" && lineUserId
            ? await prisma.account.findUnique({
                where: {
                  provider_providerAccountId: {
                    provider: "line",
                    providerAccountId: lineUserId,
                  },
                },
                select: { userId: true },
              })
            : null;
        const existingGoogleAccount =
          provider === "google" && googleId
            ? await prisma.account.findUnique({
                where: {
                  provider_providerAccountId: {
                    provider: "google",
                    providerAccountId: googleId,
                  },
                },
                select: {
                  userId: true,
                  user: { select: { role: true, status: true } },
                },
              })
            : null;

        if (
          existingGoogleAccount &&
          (existingGoogleAccount.user.role !== "CUSTOMER" ||
            existingGoogleAccount.user.status !== "ACTIVE")
        ) {
          return "/?error=StaffEmailBlocked";
        }

        // BLOCK: Don't allow OAuth to link to staff accounts
        // 員工帳號必須透過 /login（email+密碼）登入，不可透過 OAuth 進入前台
        if (oauthEmail) {
          const staffUser = await prisma.user.findUnique({ where: { email: oauthEmail } });
          if (staffUser && staffUser.role !== "CUSTOMER") {
            if (provider === "line") {
              logLineBindEvent({
                path: "oauth-line-signin",
                status: "oauth_blocked_staff_email",
                lineUserId,
                userId: staffUser.id,
              });
            }
            // 回傳自訂 redirect URL，讓首頁顯示明確錯誤訊息
            return "/?error=StaffEmailBlocked";
          }
        }

        // 多店環境下從 cookie 動態解析 store context。
        // 若 cookie 遺失（Safari 第三方 cookie 政策、跨網域 redirect 等）或 slug
        // 不在 DB，**不可** 靜默 fallback 到 DEFAULT_STORE_ID — 否則新店顧客會被
        // 建立到預設店，造成跨店資料污染。中止登入並導向錯誤訊息，請使用者重新
        // 從 /s/{slug}/ 入口進入。
        let targetStoreId: string;
        try {
          const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");
          const storeCtx = await resolveStoreFromOAuthCookie();
          if (!storeCtx) {
            console.error("[auth] OAuth signIn aborted: missing store context", {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              reason: "oauth-store-slug cookie missing or slug not in DB",
            });
            if (provider === "line") {
              logLineBindEvent({
                path: "oauth-line-signin",
                status: "oauth_store_context_lost",
                lineUserId,
                errorCode: "COOKIE_MISSING_OR_SLUG_UNKNOWN",
              });
            }
            return "/?error=OAuthStoreContextLost";
          }
          targetStoreId = storeCtx.storeId;
        } catch (err) {
          console.error("[auth] OAuth signIn aborted: store resolver threw", {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            error: err instanceof Error ? err.message : String(err),
          });
          if (provider === "line") {
            logLineBindEvent({
              path: "oauth-line-signin",
              status: "oauth_store_context_lost",
              lineUserId,
              errorCode: "RESOLVER_THREW",
            });
          }
          return "/?error=OAuthStoreContextLost";
        }

        // OAuth identity / googleId 同店唯一查找 — 必須先於任何 placeholder create。
        //
        // LINE Login only resolves through the explicit, store-scoped identity
        // link (or the already-owned Account). Customer.lineUserId belongs to
        // the store's Messaging API channel and MUST NOT be compared with a
        // LINE Login subject: LINE assigns those channels independent IDs.
        let customer = null;
        if (provider === "line" && lineUserId) {
          const verifiedLink = await prisma.customerIdentityLink.findUnique({
            where: {
              uq_customer_identity_provider_store: {
                provider: "line",
                providerAccountId: lineUserId,
                storeId: targetStoreId,
              },
            },
            select: { customer: true },
          });
          customer = verifiedLink?.customer ?? null;
          // Older direct memberships may predate CustomerIdentityLink. The
          // Account is a verified LINE Login identity, so its owner is safe
          // to use as a legacy fallback; Customer.lineUserId is not.
          if (!customer && existingLineAccount) {
            customer = await prisma.customer.findFirst({
              where: { storeId: targetStoreId, userId: existingLineAccount.userId },
            });
          }
        }
        if (!customer && provider === "google" && googleId) {
          const verifiedLink = await prisma.customerIdentityLink.findUnique({
            where: {
              uq_customer_identity_provider_store: {
                provider: "google",
                providerAccountId: googleId,
                storeId: targetStoreId,
              },
            },
            select: { customer: true },
          });
          customer = verifiedLink?.customer ?? await prisma.customer.findFirst({
            where: { googleId, storeId: targetStoreId },
          });
        }
        if (!customer && oauthEmail) {
          customer = await prisma.customer.findFirst({
            where: { email: oauthEmail, storeId: targetStoreId },
          });
        }

        if (customer?.userId) {
          // Customer exists and already has a User - link this OAuth Account to existing User.
          //
          // ── PR-G5.5.b ─────────────────────────────────────────────────
          // LINE branch: delegate to D3 (`bindLineToExistingCustomerById`)
          // via the wiring helper. Atomic Account.create + Customer.update
          // in a single Serializable transaction — closes the
          // "Account.create succeeded but Customer.update failed" drift
          // window that the legacy 2-write inline path always had.
          //
          // Defensible TIGHTENING vs pre-PR-G5.5.b behaviour:
          //   - Cross-user Account collision (Account[line] exists owned
          //     by a different User) previously silently skipped
          //     Account.create + still updated Customer.lineUserId →
          //     created drift. D3 returns `customer_locked` → helper
          //     returns ok:false → signin fails cleanly. No partial
          //     write possible.
          //
          // Byte-equivalent end-state for success cases:
          //   - bound_existing      = Customer.lineUserId null → set,
          //                            Account[line] created (full bind)
          //   - customer_repaired   = Customer.lineUserId null → set,
          //                            Account already existed for same User
          //   - account_repaired    = Customer.lineUserId already set,
            //                          Account[line] created (drift repair)
          //   - already_synced      = nothing changed
          //
          // Google branch: falls through to the existing inline 2-write
          // path below (D3 is LINE-only).
          // ─────────────────────────────────────────────────────────────

          if (provider === "line" && lineUserId) {
            const { bindLineCaseAForAuthSignIn } = await import(
              "@/server/services/auth-case-a-line-bind"
            );
            const bind = await bindLineCaseAForAuthSignIn({
              storeId: targetStoreId,
              customerId: customer.id,
              // PR-G5.5.b Codex P2: forward existing Customer.lineName
              // so the helper can preserve staff-entered / dashboard-
              // edited display values (`customer.lineName || oauthName
              // || null`). See auth-case-a-line-bind.ts for the
              // byte-equivalence matrix vs the pre-refactor inline
              // `if (oauthName && !customer.lineName)` guard.
              customerLineName: customer.lineName,
              lineUserId,
              oauthName,
              account: {
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                id_token: account.id_token,
                expires_at: account.expires_at,
                scope: account.scope,
                token_type: account.token_type,
              },
            });

            if (!bind.ok) {
              // D3 returned a controlled rejection (no partial state
              // committed — Serializable rollback / preflight reject).
              // The helper already emitted the structured
              // unexpected_error log with errorCode = d3_<reason>.
              // Surface as a NextAuth signin failure — same shape as
              // today's outer try/catch path for other failure modes.
              return false;
            }

            // Post-tx best-effort — preserved byte-equivalent vs the
            // pre-PR-G5.5.b inline path. justLinkedLine semantics from
            // D3 status (see helper docstring): true for bound_existing
            // and customer_repaired (Customer.lineUserId went null →
            // set in this run), false for account_repaired and
            // already_synced (Customer.lineUserId was ALREADY set).
            if (bind.justLinkedLine) {
              try {
                const { awardLineJoinReferrerIfEligible } = await import(
                  "@/server/services/referral-points"
                );
                await awardLineJoinReferrerIfEligible({
                  customerId: customer.id,
                  storeId: customer.storeId,
                });
              } catch {
                // 發點失敗不阻擋登入
              }
            }

            await repairCustomerIdentityOnLogin({
              userId: customer.userId,
              storeId: customer.storeId,
              phone: customer.phone ?? null,
              lineUserId,
              googleId,
              email: oauthEmail ?? null,
            });

            logLineBindEvent({
              path: "oauth-line-signin",
              status: "oauth_linked_existing",
              storeId: customer.storeId,
              lineUserId,
              customerId: customer.id,
              userId: customer.userId,
              // D3-derived accountSyncStatus (matches what
              // oauthAccountSyncStatusForExisting() used to produce for
              // the inline path).
              accountSyncStatus: bind.accountSyncStatus,
            });

            const { upsertCustomerIdentityLink } = await import(
              "@/server/services/customer-identity-link"
            );
            await upsertCustomerIdentityLink({
              userId: customer.userId,
              storeId: customer.storeId,
              customerId: customer.id,
              provider: "line",
              providerAccountId: lineUserId,
              lineUserId,
            });

            user.id = customer.userId;
            return true;
          }

          // Google uses the verified central Account and the current store.
          // A cross-user collision fails closed instead of moving the Account.
          const existingAccount = existingGoogleAccount;
          if (existingAccount && existingAccount.userId !== customer.userId) {
            return false;
          }
          const identitySync = await syncVerifiedCentralIdentity({
            entryPoint: "google",
            userId: customer.userId,
            storeId: customer.storeId,
            customerId: customer.id,
            provider: "google",
            providerAccountId: account.providerAccountId,
          });
          if (
            identitySync.status === "manual_review" ||
            identitySync.status === "rejected"
          ) {
            return false;
          }
          let accountCreated = false;
          if (!existingAccount) {
            await prisma.account.create({
              data: {
                userId: customer.userId,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token as string | undefined,
                refresh_token: account.refresh_token as string | undefined,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token as string | undefined,
              },
            });
            accountCreated = true;
          }

          // Update Customer with provider-specific IDs (Google only here)
          const updateData: Record<string, unknown> = {};
          if (provider === "google" && googleId && !customer.googleId) {
            updateData.googleId = googleId;
            if (oauthImage && !customer.avatar) updateData.avatar = oauthImage;
          }
          if (Object.keys(updateData).length > 0) {
            await prisma.customer.update({ where: { id: customer.id }, data: updateData });
          }

          await repairCustomerIdentityOnLogin({
            userId: customer.userId,
            storeId: customer.storeId,
            phone: customer.phone ?? null,
            lineUserId,
            googleId,
            email: oauthEmail ?? null,
          });

          // PR-G5.5.b: the legacy LINE-only `oauth_linked_existing` log
          // (with `accountSyncStatus` derived from
          // `oauthAccountSyncStatusForExisting()`) now lives inside the
          // LINE-branch early-return above. The Google branch never
          // emitted that log historically; no log is emitted here on
          // purpose (matches pre-PR-G5.5.b behaviour for non-LINE).
          //
          // `existingAccount` and `accountCreated` are computed above
          // for parity with the legacy structure even though their
          // only consumer (the LINE-branch log) is gone — they are
          // kept so this inline path stays a drop-in restore target
          // if PR-G5.5.b is ever reverted. Marked void to avoid
          // unused-var lint.
          void existingAccount;
          void accountCreated;

          user.id = customer.userId;
          return true;
        }

        if (customer && !customer.userId) {
          // Customer exists but no User yet (backend-created).
          //
          // ── PR-G5.5.a ─────────────────────────────────────────────────
          // LINE branch: delegate to D5 (`activatePrecreatedCustomerWithLine`)
          // via the wiring helper. Atomic User + Account + Customer writes
          // in a single Serializable transaction — closes the orphan-User /
          // orphan-Account / half-updated-Customer drift window that the
          // legacy 3-write inline path always had.
          //
          // Byte-equivalent end-state vs the pre-PR-G5.5.a inline path:
          //   - User row:     same 6 columns (name from customer snapshot,
          //                   phone fallback, email, image, role, status)
          //   - Account row:  same 10 fields incl. OAuth tokens; NO
          //                   session_state (mirrors auth.ts baseline)
          //   - Customer row: same authSource/lineUserId/lineLinkStatus/
          //                   lineLinkedAt/lineName fields written; NO
          //                   Customer.name rewrite (baseline behaviour
          //                   preserved by NOT passing customerNameOverride)
          //
          // On any D5 failure (StaleCustomerLinkError / P2034 / P2002 /
          // preflight reject), the Serializable rollback guarantees zero
          // partial state — the helper returns ok:false + a structured
          // unexpected_error log and we surface a clean `return false`.
          //
          // Google branch (and any future non-LINE OAuth provider added to
          // Case B): falls through to the existing inline 3-write path
          // below. D5 is LINE-only — Google convergence is out of scope
          // for PR-G5.5.a.
          // ─────────────────────────────────────────────────────────────

          if (provider === "line" && lineUserId && existingLineAccount) {
            await prisma.customer.update({
              where: { id: customer.id },
              data: {
                lineLinkStatus: "LINKED",
                lineLinkedAt: customer.lineLinkedAt ?? new Date(),
                ...(oauthName && !customer.lineName ? { lineName: oauthName } : {}),
              },
            });
            const { upsertCustomerIdentityLink } = await import(
              "@/server/services/customer-identity-link"
            );
            await upsertCustomerIdentityLink({
              userId: existingLineAccount.userId,
              storeId: customer.storeId,
              customerId: customer.id,
              provider: "line",
              providerAccountId: lineUserId,
              lineUserId,
            });

            logLineBindEvent({
              path: "oauth-line-signin",
              status: "oauth_linked_existing",
              storeId: customer.storeId,
              lineUserId,
              customerId: customer.id,
              userId: existingLineAccount.userId,
              accountSyncStatus: "noop_already_synced",
            });

            user.id = existingLineAccount.userId;
            return true;
          }

          if (provider === "line" && lineUserId) {
            const { activateLineCaseBForAuthSignIn } = await import(
              "@/server/services/auth-case-b-line-activation"
            );
            const activation = await activateLineCaseBForAuthSignIn({
              storeId: targetStoreId,
              customerId: customer.id,
              customerPhone: customer.phone ?? null,
              lineUserId,
              oauthName,
              oauthEmail,
              oauthImage,
              account: {
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                id_token: account.id_token,
                expires_at: account.expires_at,
                scope: account.scope,
                token_type: account.token_type,
              },
            });

            if (!activation.ok) {
              // D5 returned a controlled rejection (no partial state
              // committed — Serializable rollback). The helper already
              // emitted the structured unexpected_error log with
              // errorCode = d5_<reason>. Surface as a NextAuth signin
              // failure — same shape as today's outer try/catch path.
              return false;
            }

            // Post-tx best-effort — preserved byte-equivalent vs the
            // pre-PR-G5.5.a inline path. These three calls used to run
            // immediately after the inline customer.update at line 663;
            // they stay at the same call site, identical args, identical
            // try/catch shape.

            // 🆕 LINE 剛綁定 + 有 sponsor → 邀請者 +1
            //   (justLinkedLine is always true for LINE Case B — the
            //   pre-refactor `let justLinkedLine = false; if (provider ===
            //   "line" && lineUserId) { ...; justLinkedLine = true; }`
            //   collapsed to a guaranteed-true branch here.)
            try {
              const { awardLineJoinReferrerIfEligible } = await import(
                "@/server/services/referral-points"
              );
              await awardLineJoinReferrerIfEligible({
                customerId: customer.id,
                storeId: customer.storeId,
              });
            } catch {
              // 發點失敗不阻擋登入
            }

            await repairCustomerIdentityOnLogin({
              userId: activation.userId,
              storeId: customer.storeId,
              phone: customer.phone ?? null,
              lineUserId,
              googleId,
              email: oauthEmail ?? null,
            });

            logLineBindEvent({
              path: "oauth-line-signin",
              status: "oauth_created_user_for_customer",
              storeId: customer.storeId,
              lineUserId,
              customerId: customer.id,
              userId: activation.userId,
              accountSyncStatus: "created",
            });

            const { upsertCustomerIdentityLink } = await import(
              "@/server/services/customer-identity-link"
            );
            await upsertCustomerIdentityLink({
              userId: activation.userId,
              storeId: customer.storeId,
              customerId: customer.id,
              provider: "line",
              providerAccountId: lineUserId,
              lineUserId,
            });

            user.id = activation.userId;
            return true;
          }

          const newUser = await prisma.$transaction(async (tx) => {
            const centralUser = existingGoogleAccount
              ? await tx.user.findUniqueOrThrow({
                  where: { id: existingGoogleAccount.userId },
                })
              : await tx.user.create({
                  data: {
                    name: customer.name,
                    email: oauthEmail,
                    phone: customer.phone || null,
                    role: "CUSTOMER",
                    status: "ACTIVE",
                    image: oauthImage,
                  },
                });

            if (!existingGoogleAccount) {
              await tx.account.create({
                data: {
                  userId: centralUser.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token as string | undefined,
                  refresh_token: account.refresh_token as string | undefined,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token as string | undefined,
                },
              });
            }

            await tx.customer.update({
              where: { id: customer.id },
              data: {
                userId: centralUser.id,
                authSource: "GOOGLE",
                googleId,
                ...(oauthImage ? { avatar: oauthImage } : {}),
              },
            });
            await tx.customerIdentityLink.create({
              data: {
                userId: centralUser.id,
                storeId: customer.storeId,
                customerId: customer.id,
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
            });
            return centralUser;
          });

          await repairCustomerIdentityOnLogin({
            userId: newUser.id,
            storeId: customer.storeId,
            phone: customer.phone ?? null,
            lineUserId,
            googleId,
            email: oauthEmail ?? null,
          });

          user.id = newUser.id;
          return true;
        }

        // ─────────────────────────────────────────────────────────────────
        // LINE 找不到既有 Customer：只建立登入身份，不建立 Customer。
        //
        // 門市標準流程是店長先建顧客；若此處用 LINE userId 直接建立
        // `_oauth_line_xxx` placeholder Customer，顧客後續輸入同一支電話前
        // 後台就會多出第二筆可通知的 Customer，造成預約/方案與通知裂帳。
        //
        // 因本專案未啟用 PrismaAdapter，callback 仍需自行建立/沿用 User +
        // Account[line]，但 Customer 必須留給 /profile 的 phone resolver 以
        // `storeId + normalized phone` 回綁既有資料。若查無顧客，profile 端
        // 再依既有規則建立新 Customer。
        // ─────────────────────────────────────────────────────────────────
        if (provider === "line" && lineUserId) {
          const lineUser = await prisma.$transaction(async (tx) => {
            const u =
              existingLineAccount
                ? await tx.user.findUniqueOrThrow({
                    where: { id: existingLineAccount.userId },
                  })
                : await tx.user.create({
                    data: {
                      name: oauthName,
                      email: oauthEmail,
                      role: "CUSTOMER",
                      status: "ACTIVE",
                      image: oauthImage,
                    },
                  });

            if (!existingLineAccount) {
              await tx.account.create({
                data: {
                  userId: u.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token as string | undefined,
                  refresh_token: account.refresh_token as string | undefined,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token as string | undefined,
                },
              });
            }

            return u;
          });

          logLineBindEvent({
            path: "oauth-line-signin",
            status: "need_onboarding",
            storeId: targetStoreId,
            lineUserId,
            userId: lineUser.id,
            accountSyncStatus: existingLineAccount
              ? "noop_already_synced"
              : "created",
          });

          user.id = lineUser.id;
          return true;
        }

        // ─────────────────────────────────────────────────────────────────
        // 非 LINE OAuth 找不到既有 Customer → 保留原本建立 Customer 行為。
        // ─────────────────────────────────────────────────────────────────

        // OAuth 新顧客 phone 使用唯一佔位符，避免 compound unique (storeId, phone) 衝突
        // 顧客可後續於 profile 補填真實手機
        const oauthPlaceholderPhone = `_oauth_${provider}_${account.providerAccountId.slice(-8)}`;

        // Transaction：User + Customer + Account 三者必須同生同滅
        // 任一失敗 → 全部回滾，不會產生 orphan User / 半綁 Customer
        const { newUser, newCustomer } = await prisma.$transaction(async (tx) => {
          const u =
            provider === "google" && existingGoogleAccount
              ? await tx.user.findUniqueOrThrow({
                  where: { id: existingGoogleAccount.userId },
                })
              : provider === "line" && existingLineAccount
              ? await tx.user.findUniqueOrThrow({
                  where: { id: existingLineAccount.userId },
                })
              : await tx.user.create({
                  data: {
                    name: oauthName,
                    email: oauthEmail,
                    role: "CUSTOMER",
                    status: "ACTIVE",
                    image: oauthImage,
                  },
                });

          const c = await tx.customer.create({
            data: {
              name: oauthName,
              phone: oauthPlaceholderPhone,
              email: oauthEmail,
              authSource: provider === "line" ? "LINE" : "GOOGLE",
              // A verified Google User is central, while Customer.userId is
              // still a legacy one-to-one relation.  A second-store
              // membership is represented by CustomerIdentityLink below.
              userId: existingGoogleAccount ? undefined : u.id,
              storeId: targetStoreId,
              ...(provider === "line" && lineUserId
                ? {
                    lineUserId,
                    lineLinkStatus: "LINKED" as const,
                    lineLinkedAt: new Date(),
                    lineName: oauthName,
                  }
                : {}),
              ...(provider === "google" && googleId
                ? {
                    googleId,
                    avatar: oauthImage,
                  }
                : {}),
            },
            select: { id: true },
          });

          if (
            !(provider === "line" && existingLineAccount) &&
            !existingGoogleAccount
          ) {
            await tx.account.create({
              data: {
                userId: u.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token as string | undefined,
                refresh_token: account.refresh_token as string | undefined,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token as string | undefined,
              },
            });
          }

          if (provider === "google" && googleId) {
            await tx.customerIdentityLink.create({
              data: {
                userId: u.id,
                storeId: targetStoreId,
                customerId: c.id,
                provider: "google",
                providerAccountId: googleId,
              },
            });
          }

          return { newUser: u, newCustomer: c };
        });

        // 以下三段是 best-effort，失敗不擋登入，故放 transaction 外
        // 推薦綁定（從 pending-ref cookie；靜默失敗）
        // 使用者從 line-entry?ref= 進站後透過 Google/LINE OAuth 建立帳號時，
        // 這裡是唯一綁 sponsorId 的機會。任何失敗都不阻擋登入。
        //
        // Cookie 清除規則（統一）：只要走過 create customer 就清，無論 bind 成功與否。
        try {
          const { cookies } = await import("next/headers");
          const { bindReferralToCustomer } = await import(
            "@/server/services/referral-binding"
          );
          const cookieStore = await cookies();
          const pendingRef =
            cookieStore.get("pending-ref")?.value?.trim() || null;
          if (pendingRef) {
            await bindReferralToCustomer({
              customerId: newCustomer.id,
              storeId: targetStoreId,
              referrerRef: pendingRef,
              source: `oauth-${provider}`,
            });
            cookieStore.delete("pending-ref");
          }
        } catch {
          // 綁定失敗不影響 OAuth 登入主流程
        }

        // 🆕 若是 LINE OAuth（customer 剛以 lineLinkStatus=LINKED 建立）+ sponsor 已綁
        //    → 邀請者 +1。放在 bindReferralToCustomer 之後才有機會抓到剛綁的 sponsorId。
        if (provider === "line" && lineUserId) {
          try {
            const { awardLineJoinReferrerIfEligible } = await import(
              "@/server/services/referral-points"
            );
            await awardLineJoinReferrerIfEligible({
              customerId: newCustomer.id,
              storeId: targetStoreId,
            });
          } catch {
            // 發點失敗不阻擋登入
          }
        }

        await repairCustomerIdentityOnLogin({
          userId: newUser.id,
          storeId: targetStoreId,
          lineUserId,
          googleId,
          email: oauthEmail ?? null,
        });

        if (provider === "line") {
          const { upsertCustomerIdentityLink } = await import(
            "@/server/services/customer-identity-link"
          );
          await upsertCustomerIdentityLink({
            userId: newUser.id,
            storeId: targetStoreId,
            customerId: newCustomer.id,
            provider: "line",
            providerAccountId: lineUserId!,
            lineUserId,
          });

          logLineBindEvent({
            path: "oauth-line-signin",
            status: "oauth_created_all",
            storeId: targetStoreId,
            lineUserId,
            customerId: newCustomer.id,
            userId: newUser.id,
            accountSyncStatus: "created",
          });
        }

        user.id = newUser.id;
        return true;
      } catch (error) {
        if (account?.provider === "line") {
          logLineBindEvent({
            path: "oauth-line-signin",
            status: "unexpected_error",
            lineUserId: account?.providerAccountId ?? null,
            errorCode: error instanceof Error ? error.name : "Unknown",
          });
        }
        console.error("[auth] signIn callback error:", {
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
          email: user.email,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });
        return false;
      }
    },

    // Persist custom fields to JWT
    // 🔧 效能優化：只在登入時寫入 JWT，後續請求直接從 token 讀取
    // 不再每次 request 都查 DB。若需要即時反映 role 變更，使用者重新登入即可。
    //
    // trigger === "update" 例外：client 呼叫 useSession().update() 時觸發，
    // 從 DB 重讀 customer 資訊刷新 JWT（profile 補資料成功後使用）。
    async jwt({ token, user, account, trigger }) {
      const appToken = token as unknown as AppJWT;

      if (trigger === "update" && appToken.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: appToken.sub },
            select: {
              role: true,
              staff: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
              customer: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
            },
          });
          if (dbUser) {
            appToken.role = dbUser.role;
            if (dbUser.role === "ADMIN") {
              appToken.staffId = null;
              appToken.customerId = null;
              appToken.storeId = null;
              appToken.storeSlug = null;
            } else {
              appToken.staffId = dbUser.staff?.id ?? null;
              if (dbUser.staff) {
                appToken.customerId = null;
                appToken.storeId = dbUser.staff.storeId;
                appToken.storeSlug = dbUser.staff.store?.slug ?? null;
              } else {
                // Central members can have one legacy Customer.userId relation plus
                // additional per-store CustomerIdentityLink rows.  A profile save
                // calls useSession().update(); resolving only dbUser.customer here
                // switched the JWT back to the legacy first store immediately after
                // a new-store registration, causing /member-stores to refresh-loop.
                //
                // Prefer the verified membership for the current store cookie.  The
                // resolver fails closed on cross-store drift/conflicting links.
                const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");
                const storeCtx = await resolveStoreFromOAuthCookie();
                const currentMembership = storeCtx
                  ? await resolveCentralMemberCustomerForStore(
                      appToken.sub,
                      storeCtx.storeId,
                    )
                  : null;

                appToken.customerId =
                  currentMembership?.customerId ?? dbUser.customer?.id ?? null;
                appToken.storeId =
                  currentMembership?.storeId ?? dbUser.customer?.storeId ?? null;
                appToken.storeSlug =
                  currentMembership?.storeSlug ??
                  dbUser.customer?.store?.slug ??
                  null;
              }
            }
          }
        } catch (err) {
          console.error("[auth] jwt update trigger failed", {
            userId: appToken.sub,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return token;
      }

      // Handle stale JWTs with deprecated role values — force re-read from DB
      // Uses try-catch because the middleware Prisma client may not support new fields yet
      const DEPRECATED_ROLES = ["OWNER", "BRANCH_MANAGER", "INTERN_MANAGER", "MANAGER"];
      if (!user && appToken.role && DEPRECATED_ROLES.includes(appToken.role as string)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: appToken.sub! },
            include: { staff: true, customer: true },
          });
          if (dbUser) {
            appToken.role = dbUser.role;
            if (dbUser.role === "ADMIN") {
              appToken.staffId = null;
              appToken.customerId = null;
              appToken.storeId = null;
            } else {
              appToken.staffId = dbUser.staff?.id ?? null;
              appToken.customerId = dbUser.customer?.id ?? null;
              appToken.storeId = dbUser.staff?.storeId ?? dbUser.customer?.storeId ?? null;
            }
          }
        } catch {
          // Middleware Prisma client may be stale — just update the role from DB without storeId
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: appToken.sub! },
              select: { role: true },
            });
            if (dbUser) appToken.role = dbUser.role;
          } catch {
            // Complete failure — leave token as-is, user will need to re-login
          }
        }
        return token;
      }

      if (user) {
        appToken.sub = user.id;

        if (account?.type === "oauth" || account?.type === "oidc") {
          // OAuth login — 一律從 DB 讀取 role/staffId/customerId/storeId
          // 因為 signIn callback 已建立/綁定 User，DB 資料才是正確的
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id! },
            select: {
              role: true,
              staff: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
              customer: { select: { id: true, storeId: true, store: { select: { slug: true } } } },
            },
          });
          if (dbUser) {
            appToken.role = dbUser.role;
            // ADMIN 不綁定 store — 永遠 null
            if (dbUser.role === "ADMIN") {
              appToken.staffId = null;
              appToken.customerId = null;
              appToken.storeId = null;
              appToken.storeSlug = null;
            } else {
              appToken.staffId = dbUser.staff?.id ?? null;
              appToken.customerId = dbUser.customer?.id ?? null;
              appToken.storeId = dbUser.staff?.storeId ?? dbUser.customer?.storeId ?? null;
              appToken.storeSlug = dbUser.staff?.store?.slug ?? dbUser.customer?.store?.slug ?? null;
            }

            // Resolve the current store membership from the verified provider
            // link for every OAuth provider.  Previously this override was
            // LINE-only, so a central Google user entering a second store was
            // sent back to the legacy first-store Customer.userId relation.
            if (account?.provider && account.providerAccountId) {
              try {
                const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");
                const storeCtx = await resolveStoreFromOAuthCookie();
                if (storeCtx) {
                  const link = await prisma.customerIdentityLink.findUnique({
                    where: {
                      uq_customer_identity_provider_store: {
                        provider: account.provider,
                        providerAccountId: account.providerAccountId,
                        storeId: storeCtx.storeId,
                      },
                    },
                    select: {
                      customer: {
                        select: {
                          id: true,
                          storeId: true,
                          store: { select: { slug: true } },
                        },
                      },
                    },
                  });
                  if (link?.customer) {
                    appToken.customerId = link.customer.id;
                    appToken.storeId = link.customer.storeId;
                    appToken.storeSlug = link.customer.store?.slug ?? null;
                  } else {
                    // LINE/Google OAuth 已經由 provider 驗證，且 storeCtx 是本次
                    // 登入入口的有效店舖。若中央會員尚未在該店建立 Customer，
                    // JWT 仍須保留「這次要加入的店」，否則會退回 legacy 第一店
                    // 或 null，導致 /store-select 顯示「店舖資料遺失」。
                    //
                    // customerId 必須清空：dbUser.customer 可能是另一間門市的
                    // legacy Customer.userId 關聯，絕不可帶進目標店。
                    appToken.customerId = null;
                    appToken.storeId = storeCtx.storeId;
                    appToken.storeSlug = storeCtx.storeSlug;
                  }
                }
              } catch (err) {
                console.warn("[auth] jwt: identity link lookup failed", {
                  userId: user.id,
                  provider: account.provider,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          } else {
            console.error("[auth] jwt: DB user not found for OAuth login", { userId: user.id });
            appToken.role = "CUSTOMER";
            appToken.staffId = null;
            appToken.customerId = null;
            appToken.storeId = null;
            appToken.storeSlug = null;
          }
        } else {
          // Credentials login — authorize() 已回傳正確值
          const appUser = user as { role: UserRole; staffId: string | null; customerId: string | null; storeId: string | null; storeSlug: string | null };
          appToken.role = appUser.role;
          appToken.staffId = appUser.staffId ?? null;
          appToken.customerId = appUser.customerId ?? null;
          appToken.storeId = appUser.storeId ?? null;
          appToken.storeSlug = appUser.storeSlug ?? null;
        }
      }
      return token;
    },

    // Expose custom fields to Session
    session({ session, token }) {
      const appToken = token as unknown as AppJWT;
      session.user.id = appToken.sub ?? token.sub ?? "";
      session.user.role = appToken.role;
      session.user.staffId = appToken.staffId ?? null;
      session.user.customerId = appToken.customerId ?? null;
      session.user.storeId = appToken.storeId ?? null;
      session.user.storeSlug = appToken.storeSlug ?? null;
      return session;
    },

    // ── Redirect safety ──
    // 只允許相對路徑（接在 baseUrl 後）或同 origin 絕對 URL。
    // 這是 NextAuth v5 預設行為的顯式版本 — 若未來被錯誤 env（例如誤設的
    // NEXTAUTH_URL）或惡意參數觸發跨 host 跳轉，log 會明確提示。
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        // fallthrough
      }
      console.warn("[auth] blocked cross-origin redirect", { url, baseUrl });
      return baseUrl;
    },
  },

  pages: {
    // B7-4.5: 導向根路徑，由 proxy 依身份分流：
    //   未登入 → /s/zhubei/（顧客登入）
    //   已登入 CUSTOMER → /s/{slug}/book
    //   已登入 Staff → /s/{slug}/admin/dashboard
    signIn: "/",
    error: "/",
  },

  // 僅保留 error logger，warn/debug 使用 NextAuth 預設
  logger: {
    error(code, ...message) {
      console.error("[next-auth][error]", code, ...message);
    },
  },
});
