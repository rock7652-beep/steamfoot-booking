import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compareSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Provider } from "next-auth/providers";
import type { UserRole } from "@prisma/client";

// ============================================================
// NextAuth v5 type augmentation
// ============================================================

declare module "next-auth" {
  interface User {
    role: UserRole;
    staffId: string | null;
    customerId: string | null;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string | null;
      role: UserRole;
      staffId: string | null;
      customerId: string | null;
    };
  }
}

interface AppJWT {
  sub?: string;
  role: UserRole;
  staffId: string | null;
  customerId: string | null;
}

// ============================================================
// NextAuth config
// ============================================================

// 啟動時印出 env 狀態
console.log("[auth] ENV CHECK:", {
  hasLineId: !!process.env.LINE_LOGIN_CHANNEL_ID,
  hasLineSecret: !!process.env.LINE_LOGIN_CHANNEL_SECRET,
  hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
  hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  hasAuthSecret: !!process.env.AUTH_SECRET,
  hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
  nextauthUrl: process.env.NEXTAUTH_URL ?? "(not set)",
  authUrl: process.env.AUTH_URL ?? "(not set)",
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: true, // 完整 debug log — 部署後從 Vercel logs 看 provider 原始錯誤
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
            staff: { select: { id: true } },
            customer: { select: { id: true } },
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
          staffId: user.staff?.id ?? null,
          customerId: user.customer?.id ?? null,
        };
      },
    }),

    // ── 顧客登入（手機 + 密碼）──
    Credentials({
      id: "customer-phone",
      name: "customer-phone",
      credentials: {
        phone: { label: "手機", type: "tel" },
        password: { label: "密碼", type: "password" },
      },
      async authorize(credentials) {
        const phone = credentials?.phone as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!phone || !password) return null;

        const user = await prisma.user.findFirst({
          where: { phone, role: "CUSTOMER" },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            status: true,
            customer: { select: { id: true } },
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
        // conform 在 oauth4webapi 拿到 token response 後呼叫，
        // 可修正 LINE 回傳缺少 token_type 的問題
        async conform(response: Response) {
          const cloned = response.clone();
          const body = await cloned.json();
          console.log("[auth] LINE token conform:", {
            status: response.status,
            hasAccessToken: !!body.access_token,
            tokenType: body.token_type,
          });
          // 若 LINE 沒回傳 token_type，補上 "bearer" 讓 oauth4webapi 通過驗證
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
      // 注意：token.request 不會被 Auth.js 呼叫（是 dead code），
      //       但 userinfo.request 在 type:"oauth" 時會被呼叫
      userinfo: {
        url: "https://api.line.me/v2/profile",
        async request({ tokens }: any) {
          console.log("[auth] LINE profile fetch start");
          const res = await fetch("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const data = await res.json();
          if (!res.ok) {
            console.error("[auth] LINE profile fetch FAILED:", { status: res.status, body: data });
            throw new Error(`LINE profile error ${res.status}: ${JSON.stringify(data)}`);
          }
          console.log("[auth] LINE profile fetch OK:", { userId: data.userId, displayName: data.displayName });
          return data;
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
        console.log("[auth] signIn start:", {
          provider,
          providerAccountId: account.providerAccountId,
          email: user.email,
          name: user.name,
        });

        // Get OAuth profile info
        const oauthEmail = user.email;
        const oauthName = user.name ?? "顧客";
        const oauthImage = user.image;
        const lineUserId = provider === "line" ? account.providerAccountId : null;
        const googleId = provider === "google" ? account.providerAccountId : null;

        // BLOCK: Don't allow OAuth to link to staff accounts
        if (oauthEmail) {
          const staffUser = await prisma.user.findUnique({ where: { email: oauthEmail } });
          if (staffUser && staffUser.role !== "CUSTOMER") {
            console.error(`[auth] OAuth blocked: email ${oauthEmail} belongs to staff (role=${staffUser.role})`);
            return false; // Block - this email belongs to staff
          }
        }

        // Try to find existing Customer
        let customer = null;
        if (provider === "line" && lineUserId) {
          customer = await prisma.customer.findFirst({ where: { lineUserId } });
        }
        if (!customer && provider === "google" && googleId) {
          customer = await prisma.customer.findFirst({ where: { googleId } });
        }
        if (!customer && oauthEmail) {
          customer = await prisma.customer.findFirst({ where: { email: oauthEmail } });
        }

        console.log("[auth] customer lookup:", {
          found: !!customer,
          customerId: customer?.id ?? null,
          customerUserId: customer?.userId ?? null,
          hasUser: !!customer?.userId,
        });

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
          if (provider === "line" && lineUserId && !customer.lineUserId) {
            updateData.lineUserId = lineUserId;
            updateData.lineLinkStatus = "LINKED";
            updateData.lineLinkedAt = new Date();
            if (oauthName && !customer.lineName) updateData.lineName = oauthName;
          }
          if (provider === "google" && googleId && !customer.googleId) {
            updateData.googleId = googleId;
            if (oauthImage && !customer.avatar) updateData.avatar = oauthImage;
          }
          if (Object.keys(updateData).length > 0) {
            await prisma.customer.update({ where: { id: customer.id }, data: updateData });
          }

          // Override NextAuth's user.id to use existing User
          user.id = customer.userId;
          console.log("[auth] signIn path: existing customer+user, userId=", customer.userId);
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
          if (provider === "line" && lineUserId) {
            updateData.lineUserId = lineUserId;
            updateData.lineLinkStatus = "LINKED";
            updateData.lineLinkedAt = new Date();
            if (oauthName) updateData.lineName = oauthName;
          }
          if (provider === "google" && googleId) {
            updateData.googleId = googleId;
            if (oauthImage) updateData.avatar = oauthImage;
          }
          await prisma.customer.update({ where: { id: customer.id }, data: updateData });

          user.id = newUser.id;
          console.log("[auth] signIn path: existing customer without user, created userId=", newUser.id);
          return true;
        }

        // No existing Customer - create new Customer + User
        const newUser = await prisma.user.create({
          data: {
            name: oauthName,
            email: oauthEmail,
            role: "CUSTOMER",
            status: "ACTIVE",
            image: oauthImage,
          },
        });

        await prisma.customer.create({
          data: {
            name: oauthName,
            phone: "",
            email: oauthEmail,
            authSource: provider === "line" ? "LINE" : "GOOGLE",
            userId: newUser.id,
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

        user.id = newUser.id;
        console.log("[auth] signIn path: new customer+user, userId=", newUser.id);
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
    async jwt({ token, user, account }) {
      if (user) {
        const appToken = token as unknown as AppJWT;
        appToken.sub = user.id;

        if (account?.type === "oauth" || account?.type === "oidc") {
          // OAuth login — 一律從 DB 讀取 role/staffId/customerId
          // 因為 signIn callback 已建立/綁定 User，DB 資料才是正確的
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id! },
            select: { role: true, staff: { select: { id: true } }, customer: { select: { id: true } } },
          });
          if (dbUser) {
            appToken.role = dbUser.role;
            appToken.staffId = dbUser.staff?.id ?? null;
            appToken.customerId = dbUser.customer?.id ?? null;
            console.log("[auth] jwt (OAuth):", {
              userId: user.id,
              role: dbUser.role,
              staffId: dbUser.staff?.id ?? null,
              customerId: dbUser.customer?.id ?? null,
            });
          } else {
            // DB 查不到（不應發生）— 預設為 CUSTOMER
            console.error("[auth] jwt: DB user not found for OAuth login", { userId: user.id });
            appToken.role = "CUSTOMER";
            appToken.staffId = null;
            appToken.customerId = null;
          }
        } else {
          // Credentials login — authorize() 已回傳正確的 role/staffId/customerId
          const appUser = user as { role: UserRole; staffId: string | null; customerId: string | null };
          appToken.role = appUser.role;
          appToken.staffId = appUser.staffId ?? null;
          appToken.customerId = appUser.customerId ?? null;
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
      return session;
    },
  },

  pages: {
    signIn: "/login",
    // OAuth 錯誤導向顧客首頁（/），而非員工後台登入頁（/login）
    error: "/",
  },

  logger: {
    error(code, ...message) {
      console.error("[next-auth][error]", code, ...message);
    },
    warn(code, ...message) {
      console.warn("[next-auth][warn]", code, ...message);
    },
  },
});
