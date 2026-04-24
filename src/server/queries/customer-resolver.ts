import { prisma } from "@/lib/db";

// ============================================================
// resolveCustomer — 精簡版店舖 scoped 顧客解析
//
// 以 storeId + 任一識別欄位 (userId / lineUserId / phone / email) 的 OR 組合
// 在「同店」裡找回顧客。用途：
//   - 顧客端頁面修正 stale session.customerId 導致查不到顧客 → 空狀態
//   - Server Action / API 輸入帶身分欄位時找回 per-store customer
//
// 嚴格規則：
//   - storeId 必填；沒有就直接回 null（避免跨店誤匹配）
//   - 識別欄位至少要帶一個，否則回 null
//   - 找不到回 null；由 caller 自己判斷空狀態或 redirect
//
// 若需要「解完 + 自動綁 userId + completion 狀態」的複雜流程，
// 請改呼叫 `resolveCustomerForUser` / `resolveCustomerCompletionStatus`。
// ============================================================

export type ResolveCustomerInput = {
  storeId: string;
  userId?: string | null;
  lineUserId?: string | null;
  phone?: string | null;
  email?: string | null;
};

export async function resolveCustomer(input: ResolveCustomerInput) {
  const { storeId, userId, lineUserId, phone, email } = input;

  if (!storeId) return null;

  const normalizedPhone = phone?.trim() || undefined;
  const normalizedEmail = email?.trim().toLowerCase() || undefined;
  const normalizedUserId = userId?.trim() || undefined;
  const normalizedLineUserId = lineUserId?.trim() || undefined;

  const or: Array<Record<string, string>> = [];
  if (normalizedUserId) or.push({ userId: normalizedUserId });
  if (normalizedLineUserId) or.push({ lineUserId: normalizedLineUserId });
  if (normalizedPhone) or.push({ phone: normalizedPhone });
  if (normalizedEmail) or.push({ email: normalizedEmail });

  if (or.length === 0) return null;

  return prisma.customer.findFirst({
    where: {
      storeId,
      OR: or,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}
