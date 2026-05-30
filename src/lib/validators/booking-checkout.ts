import { z } from "zod";

// 調整結帳方式（Phase 1 — 僅 SINGLE 未收款 → PACKAGE_SESSION 扣方案）。
//
// 安全邊界沿用 single / trial 慣例：bookingId / walletId 用 .min(1) 而非
// .cuid()，真正防線是 adjustCheckoutToPackage 內的 store-scoped 查詢 +
// requirePermission("booking.update") + $transaction row lock 重查。
export const adjustCheckoutToPackageSchema = z.object({
  bookingId: z.string().min(1),
  walletId: z.string().min(1),
});
