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

// SINGLE 未收款 → 現場購買新方案；現金類付款立即開通，轉帳待確認後開通。
export const purchasePlanForSingleBookingSchema = z.object({
  bookingId: z.string().min(1),
  planId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  amount: z.number().int().min(1).max(1_000_000),
  discountReason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

// 調整結帳方式（Phase 2 / Mode B — PACKAGE_SESSION 方案扣堂 → SINGLE 單次未收款）。
//
// reason 為「選填」：現場店長可能只是快速把方案扣堂改成單次，不應因少填原因卡流程；
// AuditLog 仍一律寫入（reason 空白記 null）。不收金額——促銷價留到後續收款 Modal
// 由店長用既有原價 / 實收 / 折扣欄位處理，本階段不寫任何金額。
export const adjustCheckoutToSingleSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().max(500).optional(),
});
