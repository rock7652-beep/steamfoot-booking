import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compareSync } from "bcryptjs";
import { prisma } from "@/lib/db";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },

  providers: [
    Credentials({
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
          include: {
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
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    // Handle Google OAuth sign-in — bind to existing Customer if found
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // 🔒 防止 Google 登入綁定到 Staff/Owner 帳號
      // Staff 帳號只能用 Credentials 登入
      if (user.id) {
        const existingUser = await prisma.user.findUnique({
          where: { id: user.id as string },
          include: { staff: { select: { id: true } } },
        });
        if (existingUser?.staff) {
          // 此 email 已是 Staff 帳號，拒絕 Google OAuth 登入
          return "/login?error=staff_use_credentials";
        }
      }

      return true;
    },

    // Persist custom fields to JWT
    async jwt({ token, user, account, profile }) {
      if (user) {
        const appToken = token as unknown as AppJWT;
        appToken.sub = user.id;

        if (account?.provider === "google") {
          const googleId = account.providerAccountId;
          const googleProfile = profile as { email?: string; name?: string; picture?: string } | undefined;
          const googleEmail = googleProfile?.email || user.email;

          // 嘗試綁定或建立 Customer（帶入 Google profile 資訊）
          await bindGoogleCustomer(user.id as string, googleId, googleEmail as string, {
            name: googleProfile?.name || undefined,
            avatar: googleProfile?.picture || undefined,
          });

          // 取得最新 User 資料
          const freshUser = await prisma.user.findUnique({
            where: { id: user.id as string },
            include: {
              customer: { select: { id: true } },
              staff: { select: { id: true } },
            },
          });

          if (freshUser) {
            // 🔒 Google 登入一律為 CUSTOMER，即使 DB role 不對也強制覆蓋
            appToken.role = "CUSTOMER" as UserRole;
            appToken.staffId = null;
            appToken.customerId = freshUser.customer?.id ?? null;
          }
        } else {
          // Credentials provider
          const appUser = user as { role?: UserRole; staffId?: string | null; customerId?: string | null };
          if (appUser.role) {
            appToken.role = appUser.role;
            appToken.staffId = appUser.staffId ?? null;
            appToken.customerId = appUser.customerId ?? null;
          }
        }
      } else {
        // Subsequent requests — refresh from DB
        if (token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            include: {
              customer: { select: { id: true } },
              staff: { select: { id: true } },
            },
          });

          if (dbUser) {
            const appToken = token as unknown as AppJWT;
            appToken.role = dbUser.role;
            appToken.staffId = dbUser.staff?.id ?? null;
            appToken.customerId = dbUser.customer?.id ?? null;
          }
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
    error: "/login",
  },
});

// ============================================================
// Google 綁定邏輯
// 優先 googleId → 再 email → 綁定或建立
// ============================================================

async function bindGoogleCustomer(
  userId: string,
  googleId: string,
  googleEmail: string,
  googleProfile?: { name?: string; avatar?: string }
) {
  try {
    // Step 1: 以 googleId 查找（最穩定的識別，不受 email 變更影響）
    let customer = await prisma.customer.findUnique({
      where: { googleId },
    });

    // Step 2: 以 email 查找
    if (!customer && googleEmail) {
      customer = await prisma.customer.findFirst({
        where: { email: googleEmail },
      });
    }

    if (customer) {
      // 綁定到此 User（若尚未綁定），同時補齊 googleId / email / avatar / authSource
      const updateData: Record<string, unknown> = {};
      if (!customer.userId) updateData.userId = userId;
      if (!customer.googleId) {
        updateData.googleId = googleId;
        updateData.authSource = "GOOGLE"; // 紀錄綁定來源
      }
      if (!customer.email && googleEmail) updateData.email = googleEmail;
      // 每次登入更新 avatar（Google 大頭貼可能變更）
      if (googleProfile?.avatar) updateData.avatar = googleProfile.avatar;
      // 若 name 是預設值或空，優先帶入 Google profile name
      if (googleProfile?.name && (customer.name === "Google 用戶" || !customer.name)) {
        updateData.name = googleProfile.name;
      }

      if (Object.keys(updateData).length > 0) {
        // Prisma @updatedAt 會自動更新 updatedAt，方便追蹤綁定時間
        await prisma.customer.update({
          where: { id: customer.id },
          data: updateData,
        });
      }
    } else {
      // 建立新 Customer（暫不指派店長，由店長後續手動分配）
      await prisma.customer.create({
        data: {
          userId,
          name: googleProfile?.name || "Google 用戶",
          phone: "",
          email: googleEmail || null,
          googleId,
          avatar: googleProfile?.avatar || null,
          authSource: "GOOGLE", // 紀錄來源為 Google
          // assignedStaffId 不設定 → null，稍後由店長指派
          customerStage: "LEAD",
        },
      });
    }

    // 確保 User role 是 CUSTOMER（若該 User 不是 staff）
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { staff: { select: { id: true } } },
    });

    if (dbUser && !dbUser.staff && dbUser.role !== "CUSTOMER") {
      await prisma.user.update({
        where: { id: userId },
        data: { role: "CUSTOMER" },
      });
    }
  } catch (error) {
    console.error("[bindGoogleCustomer] Error:", error);
    // 不 throw — 讓登入流程繼續，避免用戶卡在登入畫面
    // Customer 綁定失敗不影響 User 登入本身
  }
}
