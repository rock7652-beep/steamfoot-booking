import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

// ============================================================
// Session helpers
// ============================================================

/** 取得當前 session user（null = 未登入）— React cache 確保同一 request 只查一次 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/** 取得 session；若未登入拋出 UNAUTHORIZED */
export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "請先登入");
  return user;
}

/** 要求 Owner 或 Manager 身份 */
export async function requireStaffSession() {
  const user = await requireSession();
  if (user.role !== "OWNER" && user.role !== "MANAGER") {
    throw new AppError("FORBIDDEN", "此功能僅限店長使用");
  }
  return user;
}

/** 要求 Owner 身份 */
export async function requireOwnerSession() {
  const user = await requireSession();
  if (user.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "此功能僅限店主使用");
  }
  return user;
}

/** 取得當前 Staff 記錄（Manager / Owner 皆有） */
export async function getCurrentStaff() {
  const user = await getCurrentUser();
  if (!user?.staffId) return null;
  return prisma.staff.findUnique({
    where: { id: user.staffId },
  });
}

/** 取得當前 Customer 記錄 */
export async function getCurrentCustomer() {
  const user = await getCurrentUser();
  if (!user?.customerId) return null;
  return prisma.customer.findUnique({
    where: { id: user.customerId },
  });
}
