import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isStaffRole } from "@/lib/permissions";

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

/** 要求任意員工身份（ADMIN / STORE_MANAGER / COACH） */
export async function requireStaffSession() {
  const user = await requireSession();
  if (!isStaffRole(user.role)) {
    throw new AppError("FORBIDDEN", "此功能僅限員工使用");
  }
  return user;
}

/** 要求 Admin 身份 */
export async function requireAdminSession() {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "此功能僅限系統管理者使用");
  }
  return user;
}

/** @deprecated 使用 requireAdminSession() 代替 */
export const requireOwnerSession = requireAdminSession;

/** 取得當前 Staff 記錄（所有員工角色皆有） */
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
