import { z } from "zod";
import { paymentSplitSchema } from "@/lib/payment-splits";

// 單次（SINGLE，不扣堂）現場收款。
// SUCCESS-only baseline：店長只在顧客「已付款」後按收款，當下即建立
// status=SUCCESS + paymentStatus=SUCCESS 的真實營收交易（不做 PENDING /
// 待確認 / 預收）。paymentMethod 必填且不含 UNPAID。
//
// 安全邊界沿用 trial 慣例：bookingId 用 .min(1) 而非 .cuid()，真正防線是
// collectSinglePayment 內的 store-scoped 查詢 + requirePermission("booking.update")。
//
// amount 選填；未傳時 server 取 booking.servicePlan?.price ?? 799 為原價、
// 也作為實收預設。全額折抵允許 0 元，必填原因並同時完成服務。
// discountReason / note 選填；當實收 < 原價時建議填寫供查帳。
export const collectSinglePaymentSchema = z.object({
  bookingId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  paymentSplits: z.array(paymentSplitSchema).min(2).max(5).optional(),
  amount: z.number().int().min(0).max(1_000_000).optional(),
  discountReason: z.string().trim().max(500).optional(),
  note: z.string().max(500).optional(),
  // 現場收款預設由 UI 傳 true；提前轉帳可傳 false，僅留下已收款狀態。
  completeService: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.amount !== 0) return;
  if (!data.discountReason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountReason"], message: "全額折抵請填寫原因" });
  if (data.completeService !== true) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["completeService"], message: "全額折抵須同時完成服務" });
  if (data.paymentSplits) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentSplits"], message: "全額折抵不需拆分付款" });
});
