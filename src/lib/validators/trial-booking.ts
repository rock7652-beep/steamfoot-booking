import { z } from "zod";
import { normalizePhone } from "@/lib/normalize";
import { bookingSubmissionRequestKeySchema } from "@/lib/validators/booking-submission";

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
    // PR-3c：體驗預約人數（1~4）。未傳時 server 視為 1。expectedAmount 的
    // 寫入語意改成「本次總額」=「單價 × people」，未手動改價時自動帶；店長
    // 手動輸入時以該值為總額（不再 × people）— 規則由 clampTrialTotal 處理。
    people: z.number().int().min(1).max(4).optional(),
    expectedAmount: z.number().int().min(0).max(1_000_000).optional(),
    notes: z.string().max(500).optional(),
    requestKey: bookingSubmissionRequestKeySchema.optional(),
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
  // PR-3d flow pivot：收款時若同步確認實際到店人數，一併寫入 Booking.attendedPeople。
  // 1..booking.people（server 端再驗 ≤ booking.people 與 type=FIRST_TRIAL）；
  // 省略則維持向後相容（不寫 attendedPeople，沿用 booking.attendedPeople 計算 clamp）。
  attendedPeople: z.number().int().min(1).max(4).optional(),
  // 現場服務結束後收款時，一個 transaction 同時收款並完成服務；
  // 提前轉帳僅收款時傳 false。預設 false 保留既有呼叫的向後相容。
  completeService: z.boolean().optional(),
});

// 體驗 499 PR-3b：收款更正 = 作廢原 TRIAL_PURCHASE + 重建新 TRIAL_PURCHASE SUCCESS。
// 不直接改舊交易、不刪、不退款。OWNER-only（server 端 requirePermission
// "transaction.void"）、僅 PENDING/CONFIRMED booking。reason 必填（沿用
// voidTransaction reason 上限 500，作為作廢理由與查帳軌跡）。
export const correctTrialCollectionSchema = z.object({
  bookingId: z.string().min(1),
  originalTransactionId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER"]),
  amount: z.number().int().min(0).max(1_000_000).optional(),
  reason: z.string().min(1, "請填寫更正原因").max(500),
});
