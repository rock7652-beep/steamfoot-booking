import { z } from "zod";
import { normalizePhone } from "@/lib/normalize";
import { parseTaipeiDateTime } from "@/lib/date-utils";
export const key = z.string().min(1).max(100);
export const money = z.number().int().min(0).max(10000000);
export const gender = z.enum(["FEMALE", "MALE"]);
export const preference = z.enum(["FEMALE", "MALE", "ANY"], {
  required_error: "請選擇技師性別",
});
export const rate = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("FIXED"), value: money }),
  z.object({ mode: z.literal("HOURLY"), value: money }),
  z.object({
    mode: z.literal("PERCENT"),
    value: z.number().min(0).max(100),
    base: z.enum(["LIST", "PAID"]),
  }),
]);
export type Rate = z.infer<typeof rate>;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const period = z
  .object({ start: clock, end: clock })
  .refine((p) => p.end > p.start, "結束時間須晚於開始時間");
export const serviceInput = z.object({
  id: key.optional(),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(100),
  category: z.string().max(100).default(""),
  duration: z.number().int().min(5).max(720),
  buffer: z.number().int().min(0).max(240).default(0),
  price: money,
  trialPrice: money.nullable().default(null),
  active: z.boolean().default(true),
});
export const technicianInput = z.object({
  id: key.optional(),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(100),
  gender,
  userId: key.nullable().default(null),
  serviceIds: z.array(key).max(200),
  weekly: z.union([z.object({inheritStore:z.literal(true)}),z
    .array(
      z
        .object({
          day: z.number().int().min(0).max(6),
          start: clock,
          end: clock,
        })
        .refine((p) => p.end > p.start, "結束時間須晚於開始時間"),
    )
    .max(50)]).default({inheritStore:true}),
  exceptions: z.record(z.array(period)).default({}),
  rates: z.record(rate),
  grants: z
    .array(z.enum(["complete", "cancel", "reschedule", "income"]))
    .default([]),
  sort: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});
export const planInput = z.object({
  lowBalanceEnabled: z.boolean().default(false),
  lowBalanceThreshold: z.number().int().min(0).max(10000).nullable().default(null),
  id: key.optional(),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(100),
  sessions: z.number().int().min(1).max(10000),
  price: money,
  validDays: z.number().int().min(1).max(3650),
  serviceIds: z.array(key).min(1).max(200),
  allowShared: z.boolean().default(false),
  customerPurchasable: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const settingsInput = z.object({
  notifications: z.boolean().default(false),
  revision: z.number().int().nonnegative(),
  selfBooking: z.boolean(),
  selfCancel: z.boolean(),
  selfReschedule: z.boolean(),
  cancelDeduct: z.boolean(),
  noShowDeduct: z.boolean(),
  leadMinutes: z.number().int().min(0).max(43200),
  cancelLeadMinutes: z.number().int().min(0).max(43200),
  bookableDays: z.number().int().min(1).max(365),
});
const phone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^09\d{8}$/, "請填寫有效手機"));
export const personInput = z.object({
  name: z.string().trim().min(1).max(80),
  phone,
  customerId: key.nullable().default(null),
  serviceId: key,
  serviceRevision: z.number().int().nonnegative().default(0),
  preference,
  specifiedTechnicianId: key.nullable().default(null),
  cardId: key.nullable().default(null),
  notes: z.string().max(1000).default(""),
});
export const partyInput = z
  .object({
    requestKey: z.string().uuid(),
    policyRevision: z.number().int().nonnegative().default(0),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: clock,
    contactName: z.string().trim().min(1).max(80),
    phone,
    isTrial: z.boolean(),
    people: z.array(personInput).min(1).max(12),
  })
  .superRefine((v, c) => {
    if (!parseTaipeiDateTime(v.date, v.time))
      c.addIssue({ code: "custom", message: "日期時間無效" });
  });
export type PartyInput = z.infer<typeof partyInput>;
export const changeInput = z.object({
  requestKey: z.string().uuid(),
  id: key,
  revision: z.number().int().nonnegative(),
  target: z.enum(["COMPLETED", "CANCELLED", "NO_SHOW", "RESERVED"]),
  reason: z.string().trim().min(1).max(500),
});
export const paymentInput = z
  .object({
    requestKey: z.string().uuid(),
    ids: z.array(key).min(1).max(12),
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
    amounts: z.array(money).min(1).max(12),
    note: z.string().max(500).default(""),
  })
  .refine(
    (v) =>
      v.ids.length === v.amounts.length && new Set(v.ids).size === v.ids.length,
    "請逐人核對金額",
  );
export const cardInput = z.object({
  requestKey: z.string().uuid(),
  planId: key,
  customerId: key,
  memberIds: z.array(key).max(20),
  paid: money,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
});
export const refundInput = z.object({
  requestKey: z.string().uuid(),
  paymentId: key,
  amount: z.number().int().positive().max(10000000),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  reason: z.string().trim().min(1).max(500),
});
export const moveInput = z.object({
  requestKey: z.string().uuid(),
  id: key,
  revision: z.number().int().nonnegative(),
  date: z.string(),
  time: clock,
  technicianId: key.nullable().default(null),
  locationId: key.nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});
export const tabs = [
  "首頁",
  "班表",
  "顧客管理",
  "顧客經營",
  "營運",
  "分析",
  "位置管理",
  "服務項目",
  "收費方式",
  "技師管理",
  "人員管理",
  "圖片公告",
  "設定",
] as const;
export type BeautyTab = (typeof tabs)[number];
