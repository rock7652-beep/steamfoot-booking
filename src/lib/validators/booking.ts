import { z } from "zod";

export const createBookingSchema = z.object({
  // 不用 .cuid()：既有/匯入/staging seed 的 Customer ID 未必是 cuid。
  // createBooking 內已有 customer.findUnique → NOT_FOUND + 跨店存取檢查作為
  // 真正安全邊界；ID 格式不該是驗證關卡。（PR-2 體驗預約需求；shared validator
  // 刻意放寬，非 silent scope creep。）
  customerId: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  bookingType: z.enum(["FIRST_TRIAL", "SINGLE", "PACKAGE_SESSION"]),
  // 不用 .cuid()：方案 / wallet / 補課資格 ID 可能來自 staging seed（如
  // "staging-wallet-001"）/ 匯入 / 固定 ID，未必是 Prisma cuid。比照上方
  // customerId 與 #236 assignPlanSchema：ID 格式不該是驗證關卡，安全邊界由
  // createBooking 內的 customer.findUnique + 跨店檢查 + 顧客自有 wallet 範圍
  // 配堂控制。empty string 仍被 .min(1) 擋；optional 行為不變。
  servicePlanId: z.string().min(1).optional(),
  // SPA 芳療師排程從「人員 × 時間」空格建立預約時帶入。
  // 不限制 cuid：Demo seed / 匯入資料可能使用固定 ID；安全邊界由
  // createBooking 內的同店、啟用狀態驗證負責。
  serviceStaffId: z.string().min(1).optional(),
  customerPlanWalletId: z.string().min(1).optional(),
  people: z.number().int().min(1).max(4).optional(),
  isMakeup: z.boolean().optional(),
  makeupCreditId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
  skipDutyCheck: z.boolean().optional(), // OWNER 可略過值班檢查
  // 體驗 499 PR-2：建立體驗預約時帶入的預計收款金額快照（選填）。
  // 不傳時 → booking.expectedAmount = null，既有預約行為完全不變（additive）。
  expectedAmount: z.number().int().min(0).max(1_000_000).optional(),
});

export const createRecurringBookingsSchema = z.object({
  customerId: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  bookingType: z.literal("PACKAGE_SESSION"),
  servicePlanId: z.string().min(1),
  customerPlanWalletId: z.string().min(1).optional(),
  people: z.number().int().min(1).max(4).default(1),
  weeks: z.number().int().min(1).max(12),
  notes: z.string().max(500).optional(),
  skipDutyCheck: z.boolean().optional(),
});

export const updateBookingSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  people: z.number().int().min(1).max(4).optional(),
  serviceStaffId: z.string().cuid().optional(),
  notes: z.string().max(500).optional(),
});

export const completeBookingSchema = z.object({
  serviceStaffId: z.string().cuid().optional(),
  // 實際到店人數（多人預約的部分到店流程）。
  // 1..people；省略則維持 null（向後相容，顯示與收款皆視為全到）。
  // server 端再驗證 attendedPeople ≤ booking.people；
  attendedPeople: z.number().int().min(1).max(4).optional(),
  // 套餐部分到店時，未到者仍扣原預約堂數；此欄只決定是否發補課券。
  partialNoShowChoice: z
    .enum(["DEDUCTED", "DEDUCTED_WITH_MAKEUP"])
    .optional(),
});
