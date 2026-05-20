import { z } from "zod";

// 單次（SINGLE，不扣堂）現場收款。
// SUCCESS-only baseline：店長只在顧客「已付款」後按收款，當下即建立
// status=SUCCESS + paymentStatus=SUCCESS 的真實營收交易（不做 PENDING /
// 待確認 / 預收）。paymentMethod 必填且不含 UNPAID。
//
// 安全邊界沿用 trial 慣例：bookingId 用 .min(1) 而非 .cuid()，真正防線是
// collectSinglePayment 內的 store-scoped 查詢 + requirePermission("booking.update")。
//
// amount 選填；未傳時 server 取 booking.servicePlan?.price ?? 799 為原價、
// 也作為實收預設（= 全價收款）。最小 1 元 — 不接受 0 元成功交易（spec：
// SINGLE 是付費服務，免費請走完成服務時的其他流程）。
// discountReason / note 選填；當實收 < 原價時建議填寫供查帳。
export const collectSinglePaymentSchema = z.object({
  bookingId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  amount: z.number().int().min(1).max(1_000_000).optional(),
  discountReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});
