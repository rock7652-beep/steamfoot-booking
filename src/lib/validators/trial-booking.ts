import { z } from "zod";
import { normalizePhone } from "@/lib/normalize";

// 體驗 499 PR-2：建立未付款體驗預約。
// 規則：擇一 — 既有顧客(customerId) 或 快速建檔(newCustomer name+phone)。
// 直屬店長(assignedStaffId) 必填（每位體驗客一定有直屬店長）。
// expectedAmount 選填，不傳時由 server 帶店家體驗價預設並 clamp。

const phoneSchema = z
  .string()
  .transform((v) => normalizePhone(v ?? ""))
  .refine((v) => /^09\d{8}$/.test(v), {
    message: "手機號碼格式不正確（09 開頭共 10 碼）",
  });

export const createTrialBookingSchema = z
  .object({
    // ⚠️ 不用 .cuid()：既有資料（staging seed / 可能的舊 prod / 匯入）ID 未必是
    // cuid（例：staging-cust-005 / staging-staff-owner）。ID 格式不是安全邊界 —
    // 真正的防線是 createTrialBooking 內的 store-scoped 查詢
    // （customer/staff findFirst { id, storeId }）+ requirePermission("trial.create")。
    customerId: z.string().min(1).optional(),
    newCustomer: z
      .object({
        name: z.string().trim().min(1, "請輸入姓名").max(100),
        phone: phoneSchema,
      })
      .optional(),
    assignedStaffId: z.string().min(1),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slotTime: z.string().regex(/^\d{2}:\d{2}$/),
    expectedAmount: z.number().int().min(0).max(1_000_000).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => Boolean(d.customerId) !== Boolean(d.newCustomer), {
    message: "請擇一：選擇既有顧客，或填寫新顧客姓名與電話",
    path: ["customerId"],
  });

// 體驗 499 PR-3：現場立即收款。
// SUCCESS-only baseline：店長只在顧客「已付款」後按收款，當下即建立
// status=SUCCESS + paymentStatus=SUCCESS 的真實營收交易（不做 PENDING /
// 待確認 / 預收）。paymentMethod 必填且不含 UNPAID。
// bookingId 用 .min(1) 非 .cuid()（與本系統慣例一致）：真正安全邊界是
// collectTrialPayment 內 store-scoped 查詢 + requirePermission("trial.confirm")。
// amount 選填；未傳時 server 帶 Booking.expectedAmount 快照 / 店家預設，一律 clamp。
export const collectTrialPaymentSchema = z.object({
  bookingId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  amount: z.number().int().min(0).max(1_000_000).optional(),
});
