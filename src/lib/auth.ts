import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compareSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Provider } from "next-auth/providers";
import type { UserRole } from "@prisma/client";
import { DEFAULT_STORE_ID } from "@/lib/store";

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
        const phone = credentials?.phone as string | undefined;
        const password = credentials?.password as string | undefined;
        const storeId = credentials?.storeId as string | undefined;

        if (!phone || !password) return null;

        // B7-4: 若有 storeId，先從 Customer 表按店查找對應 User
        if (storeId) {
          const customer = await prisma.customer.findFirst({
            where: { phone, storeId },
            select: {
              id: true,
              storeId: true,
              store: { select: { slug: true } },
              user: {
                select: {
                  id: true, name: true, email: true,
                  passwordHash: true, role: true, status: true,
                },
              },
            },
          });

          if (!customer?.user || !customer.user.passwordHash) return null;
          if (customer.user.status !== "ACTIVE") return null;
          if (!compareSync(password, customer.user.passwordHash)) return null;

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
          bot_prompt: "aggressive",
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
        async request({ tokens }: any) {
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
      profile(profile: any) {
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
  ],

  callbacks: {
    // ── OAuth account linking ──
    async signIn({ user, account }) {
      try {
        // Skip for Credentials providers
        if (!account || (account.type !== "oauth" && account.type !== "oidc")) return true;

        const provider = account.provider; // "google" or "line"

        // Get OAuth profile info
        const oauthEmail = user.email;
        const oauthName = user.name ?? "顧客";
        const oauthImage = user.image;
        const lineUserId = provider === "line" ? account.providerAccountId : null;
        const googleId = provider === "google" ? account.providerAccountId : null;

        // BLOCK: Don't allow OAuth to link to staff accounts
        // 員工帳號必須透過 /login（email+密碼）登入，不可透過 OAuth 進入前台
        if (oauthEmail) {
          const staffUser = await prisma.user.findUnique({ where: { email: oauthEmail } });
          if (staffUser && staffUser.role !== "CUSTOMER") {
            // 回傳自訂 redirect URL，讓首頁顯示明確錯誤訊息
            return "/?error=StaffEmailBlocked";
          }
        }

        // B7-4: 從 cookie 動態解析 store context（可能因 Safari 第三方 cookie 政策
        // 在 OAuth redirect 過程被吃掉，這時會 fallback 到 DEFAULT_STORE_ID）
        let targetStoreId: string;
        try {
          const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");
          const storeCtx = await resolveStoreFromOAuthCookie();
          targetStoreId = storeCtx.storeId;
        } catch {
          targetStoreId = DEFAULT_STORE_ID;
        }

        // lineUserId / googleId 先做「全域唯一」查找 — 避免 storeId fallback 時錯過既有
        // 顧客而誤建新 User。若全域找到多筆（跨店重複，理論罕見）則 fallback 到同店查找。
        let customer = null;
        if (provider === "line" && lineUserId) {
          const candidates = await prisma.customer.findMany({
            where: { lineUserId },
            take: 2,
          });
          if (candidates.length === 1) {
            customer = candidates[0];
            if (customer.storeId !== targetStoreId) {
              console.info("[auth] signIn: line user cross-store — using existing customer", {
                lineUserId,
                customerStoreId: customer.storeId,
                cookieStoreId: targetStoreId,
              });
              targetStoreId = customer.storeId; // 以 Customer 所在店為準
            }
          } else if (candidates.length > 1) {
            console.warn("[auth] signIn: line user found in multiple stores, using target", {
              lineUserId,
              count: candidates.length,
              targetStoreId,
            });
            customer = candidates.find((c) => c.storeId === targetStoreId) ?? null;
          }
        }
        if (!customer && provider === "google" && googleId) {
          const candidates = await prisma.customer.findMany({
            where: { googleId },
            take: 2,
          });
          if (candidates.length === 1) {
            customer = candidates[0];
            if (customer.storeId !== targetStoreId) {
              console.info("[auth] signIn: google user cross-store — using existing customer", {
                googleId,
                customerStoreId: customer.storeId,
                cookieStoreId: targetStoreId,
              });
              targetStoreId = customer.storeId;
            }
          } else if (candidates.length > 1) {
            customer = candidates.find((c) => c.storeId === targetStoreId) ?? null;
          }
        }
        if (!customer && oauthEmail) {
          customer = await prisma.customer.findFirst({
            where: { email: oauthEmail, storeId: targetStoreId },
          });
        }

        if (customer?.userId) {
          // Customer exists and already has a User - link this OAuth Account to existing User
          const existingAccount = await prisma.account.findUnique({
            where: { provider_providerAccountId: { provider, providerAccountId: account.providerAccountId } },
          });
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
          }

          // Update Customer with provider-specific IDs
          const updateData: Record<string, unknown> = {};
          let justLinkedLine = false;
          if (provider === "line" && lineUserId && !customer.lineUserId) {
            updateData.lineUserId = lineUserId;
            updateData.lineLinkStatus = "LINKED";
            updateData.lineLinkedAt = new Date();
            if (oauthName && !customer.lineName) updateData.lineName = oauthName;
            justLinkedLine = true;
          }
          if (provider === "google" && googleId && !customer.googleId) {
            updateData.googleId = googleId;
            if (oauthImage && !customer.avatar) updateData.avatar = oauthImage;
          }
          if (Object.keys(updateData).length > 0) {
            await prisma.customer.update({ where: { id: customer.id }, data: updateData });
          }

          // 🆕 LINE 剛綁定 + 有 sponsor → 邀請者 +1（sourceKey dedupe 保證只發一次）
          if (justLinkedLine) {
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

          user.id = customer.userId;
          return true;
        }

        if (customer && !customer.userId) {
          // Customer exists but no User yet (backend-created) - create User and link
          const newUser = await prisma.user.create({
            data: {
              name: customer.name,
              email: oauthEmail,
              phone: customer.phone || null,
              role: "CUSTOMER",
              status: "ACTIVE",
              image: oauthImage,
              customer: { connect: { id: customer.id } },
            },
          });

          await prisma.account.create({
            data: {
              userId: newUser.id,
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

          // Update Customer
          const updateData: Record<string, unknown> = { authSource: provider === "line" ? "LINE" : "GOOGLE" };
          let justLinkedLine = false;
          if (provider === "line" && lineUserId) {
            updateData.lineUserId = lineUserId;
            updateData.lineLinkStatus = "LINKED";
            updateData.lineLinkedAt = new Date();
            if (oauthName) updateData.lineName = oauthName;
            justLinkedLine = true;
          }
          if (provider === "google" && googleId) {
            updateData.googleId = googleId;
            if (oauthImage) updateData.avatar = oauthImage;
          }
          await prisma.customer.update({ where: { id: customer.id }, data: updateData });

          // 🆕 LINE 剛綁定 + 有 sponsor → 邀請者 +1
          if (justLinkedLine) {
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

          user.id = newUser.id;
          return true;
        }

        // No existing Customer - create new Customer + User
        // OAuth 新顧客 phone 使用唯一佔位符，避免 compound unique (storeId, phone) 衝突
        // 顧客可後續於 profile 補填真實手機
        const oauthPlaceholderPhone = `_oauth_${provider}_${account.providerAccountId.slice(-8)}`;

        const newUser = await prisma.user.create({
          data: {
            name: oauthName,
            email: oauthEmail,
            role: "CUSTOMER",
            status: "ACTIVE",
            image: oauthImage,
          },
        });

        const newCustomer = await prisma.customer.create({
          data: {
            name: oauthName,
            phone: oauthPlaceholderPhone,
            email: oauthEmail,
            authSource: provider === "line" ? "LINE" : "GOOGLE",
            userId: newUser.id,
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

        await prisma.account.create({
          data: {
            userId: newUser.id,
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

        user.id = newUser.id;
        return true;
      } catch (error) {
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
              appToken.customerId = dbUser.customer?.id ?? null;
              appToken.storeId = dbUser.staff?.storeId ?? dbUser.customer?.storeId ?? null;
              appToken.storeSlug = dbUser.staff?.store?.slug ?? dbUser.customer?.store?.slug ?? null;
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
              appToken.storeId = (dbUser.staff as any)?.storeId ?? (dbUser.customer as any)?.storeId ?? null;
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
