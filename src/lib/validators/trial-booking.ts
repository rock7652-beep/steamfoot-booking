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
    customerId: z.string().cuid().optional(),
    newCustomer: z
      .object({
        name: z.string().trim().min(1, "請輸入姓名").max(100),
        phone: phoneSchema,
      })
      .optional(),
    assignedStaffId: z.string().cuid(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slotTime: z.string().regex(/^\d{2}:\d{2}$/),
    expectedAmount: z.number().int().min(0).max(1_000_000).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => Boolean(d.customerId) !== Boolean(d.newCustomer), {
    message: "請擇一：選擇既有顧客，或填寫新顧客姓名與電話",
    path: ["customerId"],
  });
