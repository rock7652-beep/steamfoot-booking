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
    }),
  ],

  callbacks: {
    // Handle Google OAuth sign-in — bind to existing Customer if found
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const googleId = account.providerAccountId;
      const googleEmail = profile?.email || user.email;

      // Step 1: 以 googleId 查找既有 Customer
      let existingCustomer = await prisma.customer.findUnique({
        where: { googleId },
      });

      // Step 2: 找不到 → 以 email 查找
      if (!existingCustomer && googleEmail) {
        existingCustomer = await prisma.customer.findFirst({
          where: { email: googleEmail },
        });
      }

      // Step 3: 如果找到既有 Customer 且已有 userId，檢查是否是同一 User
      if (existingCustomer && existingCustomer.userId) {
        // 已綁定 — 正常登入（PrismaAdapter 會處理 Account 連結）
        return true;
      }

      // 後續綁定邏輯在 jwt callback 處理（因為需要 User.id）
      return true;
    },

    // Persist custom fields to JWT
    async jwt({ token, user, account, profile }) {
      if (user) {
        const appToken = token as unknown as AppJWT;
        appToken.sub = user.id;

        if (account?.provider === "google") {
          const googleId = account.providerAccountId;
          const googleEmail = (profile as { email?: string })?.email || user.email;

          // 嘗試綁定或建立 Customer
          await bindGoogleCustomer(user.id as string, googleId, googleEmail as string);

          // 取得最新 User 資料
          const freshUser = await prisma.user.findUnique({
            where: { id: user.id as string },
            include: {
              customer: { select: { id: true } },
              staff: { select: { id: true } },
            },
          });

          if (freshUser) {
            appToken.role = freshUser.role;
            appToken.staffId = freshUser.staff?.id ?? null;
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
  googleEmail: string
) {
  // Step 1: 以 googleId 查找
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
    // 綁定到此 User（若尚未綁定）
    const updateData: Record<string, unknown> = {};
    if (!customer.userId) updateData.userId = userId;
    if (!customer.googleId) updateData.googleId = googleId;
    if (!customer.email && googleEmail) updateData.email = googleEmail;

    if (Object.keys(updateData).length > 0) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: updateData,
      });
    }
  } else {
    // 建立新 Customer（暫不指派店長）
    const googleUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    await prisma.customer.create({
      data: {
        userId,
        name: googleUser?.name || "Google 用戶",
        phone: "",
        email: googleEmail || null,
        googleId,
        assignedStaffId: undefined, // 稍後由店長指派
        customerStage: "LEAD",
      },
    });
  }

  // 確保 User role 是 CUSTOMER（若不是 staff）
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
}
