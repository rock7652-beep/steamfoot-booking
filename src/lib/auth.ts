import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compareSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { UserRole } from "@prisma/client";

// ============================================================
// NextAuth v5 type augmentation
// Session + User are augmented via "next-auth".
// JWT fields are accessed via explicit casting in callbacks
// (module "@auth/core/jwt" augmentation is not available in this env).
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

// ============================================================
// Custom token shape (not augmenting @auth/core/jwt — cast in callbacks)
// ============================================================

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
    // Handle new Google OAuth users
    async signIn({ user, account, profile }) {
      // Only process for Google OAuth provider
      if (account?.provider === "google") {
        // Check if this Google account is linked to an existing user
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: account.providerAccountId,
            },
          },
          include: {
            user: {
              include: {
                customer: { select: { id: true } },
              },
            },
          },
        });

        // If this is a new Google user (no account linked yet)
        if (!existingAccount && user.email && user.name) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: {
              customer: { select: { id: true } },
            },
          });

          // If user doesn't exist in DB, they'll be auto-created by PrismaAdapter
          // Now create a Customer record for new Google users
          if (!dbUser) {
            // Wait a bit for the adapter to create the user, then create customer
            // This is handled in the jwt callback instead
          }
        }
      }
      return true;
    },

    // Persist custom fields to the JWT token
    async jwt({ token, user, account }) {
      if (user) {
        // user is our authorize() return value — cast to access custom fields
        const appToken = token as unknown as AppJWT;
        const appUser = user as { role?: UserRole; staffId?: string | null; customerId?: string | null };
        appToken.sub = user.id;

        // For OAuth users on first sign-in, create Customer record
        if (account?.provider === "google" && user.email) {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              customer: { select: { id: true } },
              staff: { select: { id: true } },
            },
          });

          if (dbUser) {
            // If this is a new user (no customer/staff record yet)
            if (!dbUser.customer && !dbUser.staff) {
              // Create a Customer record with CUSTOMER role
              // Need to find an assignedStaffId — for now use first OWNER or create default
              let assignedStaffId = await prisma.staff.findFirst({
                where: { isOwner: true },
                select: { id: true },
              });

              if (!assignedStaffId) {
                // Fallback: create a default staff record if no owner exists
                const defaultStaff = await prisma.staff.create({
                  data: {
                    user: {
                      create: {
                        name: "Default Admin",
                        email: "admin@default.local",
                        role: "OWNER",
                      },
                    },
                    displayName: "Default Admin",
                    isOwner: true,
                  },
                  select: { id: true },
                });
                assignedStaffId = defaultStaff;
              }

              // Create customer record
              await prisma.customer.create({
                data: {
                  userId: dbUser.id,
                  name: dbUser.name,
                  phone: "", // Will be updated later
                  assignedStaffId: assignedStaffId.id,
                  customerStage: "LEAD",
                },
              });

              // Update user role to CUSTOMER if not already set
              if (dbUser.role !== "CUSTOMER") {
                await prisma.user.update({
                  where: { id: dbUser.id },
                  data: { role: "CUSTOMER" },
                });
              }
            }

            // Fetch fresh user data with relationships
            const freshUser = await prisma.user.findUnique({
              where: { id: dbUser.id },
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
          }
        } else if (appUser?.role) {
          // For credentials provider, use the values from authorize()
          appToken.role = appUser.role;
          appToken.staffId = appUser.staffId ?? null;
          appToken.customerId = appUser.customerId ?? null;
        } else {
          // Fallback: fetch from database for any provider
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              customer: { select: { id: true } },
              staff: { select: { id: true } },
            },
          });

          if (dbUser) {
            appToken.role = dbUser.role;
            appToken.staffId = dbUser.staff?.id ?? null;
            appToken.customerId = dbUser.customer?.id ?? null;
          }
        }
      } else {
        // On subsequent calls, refresh role/staffId/customerId from DB
        // This ensures we get the latest values if they were updated by an admin
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

    // Expose custom fields to the Session object
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
