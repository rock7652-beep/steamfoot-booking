import { z } from "zod";
import { normalizePhone } from "@/lib/normalize";
import { parseBirthday } from "@/lib/birthday";

/**
 * 顧客基本資料 validator
 *
 * 新規則：除 notes 外，其餘基本身份資料皆必填。
 * - DB schema 仍保留 nullable（舊資料允許缺漏）
 * - 這層 zod 是 app-level 必填，新資料從此必須完整
 */

// phone：先把 0912-345-678 / +886... / 多餘空白都吸成 0912345678，再驗 09xxxxxxxx
const phoneSchema = z
  .string()
  .transform((v) => normalizePhone(v ?? ""))
  .refine((v) => /^09\d{8}$/.test(v), {
    message: "手機號碼格式不正確（09 開頭共 10 碼）",
  });

// 空字串 → undefined：caller 從 FormData 拿到的多半是 ""，先吸成 undefined 再交給 .optional()
const emptyToUndef = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.unknown(),
);

const optionalBirthday = emptyToUndef.pipe(
  z.string().trim().refine((value) => parseBirthday(value).success, "生日日期不正確").optional(),
);

// 後台新增顧客（staff 建立）— 快速建檔：只 name + phone 必填
// email / gender / birthday 改為 optional，店長可以 10 秒內建好一筆顧客；
// 其他欄位之後在編輯頁補。Customer.email/gender/birthday DB 已是 nullable。
export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(100),
  phone: phoneSchema,
  email: emptyToUndef.pipe(
    z.string().trim().email("Email 格式不正確").max(200).optional(),
  ),
  gender: emptyToUndef.pipe(z.enum(["male", "female", "other"]).optional()),
  birthday: optionalBirthday,
  // lineName / notes 可空
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  // 後台建立時可稍後指派。
  // ⚠️ 用 .min(1) 非 .cuid()（與本檔 §"ID 欄位用 min(1) 非 cuid" 慣例一致）：
  // 既有/匯入/staging seed 的 staff ID 未必是 cuid（例：staging-staff-owner）。
  // createCustomer 內 prisma.staff.findUnique({id,status:ACTIVE}) + NOT_FOUND 才是
  // 真正安全邊界。修正 B（月曆快速建檔）/ C（後台新增顧客）的 Invalid cuid。
  assignedStaffId: z.string().min(1).optional(),
});

// 後台編輯顧客（店長補資料情境）：name + phone 必填，其餘皆選填。
// 前台顧客自助 profile / onboarding 走 src/server/actions/profile.ts 的 inline
// 驗證，不共用本 schema；放寬此 schema 不會影響前台流程。
// email/gender/birthday/height 空字串會被 preprocess 成 undefined；
// action 層會把 undefined 寫成 null 以清除 DB 欄位。
export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(100),
  phone: phoneSchema,
  email: emptyToUndef.pipe(
    z.string().trim().email("Email 格式不正確").max(200).optional(),
  ),
  gender: emptyToUndef.pipe(z.enum(["male", "female", "other"]).optional()),
  birthday: optionalBirthday,
  height: z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "string") {
        if (v.trim() === "") return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
      return v;
    },
    z.number().min(50).max(250).optional(),
  ),
  // lineName / notes 仍可空
  lineName: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // 非基本資料，保留可選
  customerStage: z.enum(["LEAD", "TRIAL", "ACTIVE", "INACTIVE"]).optional(),
  selfBookingEnabled: z.boolean().optional(),
  assignedStaffId: z.string().cuid().nullable().optional(),
});

export const transferCustomerSchema = z.object({
  customerId: z.string().cuid(),
  newStaffId: z.string().cuid(),
});

// 內部服務備註（後台限定）單一欄位更新 — 走專用 action，不走整包 updateCustomer，
// 避免誤改姓名/電話/生日/店長/狀態等其他欄位。
//   - customerId 用 .min(1) 非 .cuid()（staging / 匯入 id 未必是 cuid；存在性由
//     action 內 prisma 查詢 + store filter 把關）。
//   - serviceNote：trim 後空字串 / 全空白 → null（清除）；上限 1000 字。
export const updateCustomerServiceNoteSchema = z.object({
  customerId: z.string().min(1),
  serviceNote: z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "string") {
        const t = v.trim();
        return t === "" ? null : t;
      }
      return v;
    },
    z.string().max(1000, "內部服務備註最多 1000 字").nullable(),
  ),
});

// 顧客歸屬設定（列表 drawer 用）
//   - assignedStaffId：直屬店長（必填）
//   - referredByCustomerId：推薦人（選填；null = 清除）
//
// 注意：ID 欄位用 `.min(1)`（非空字串）而非 `.cuid()`。
// Zod cuid 是「格式檢查」，但實際存在性由 server action 內的 DB lookup 確認
// （staff.findUnique / customer.findUnique）。歷史資料可能有非標準 cuid 的 ID
// （seed / 不同工具產生），Zod 不該比 DB 還嚴格而誤拒真實存在的 ID。
export const updateCustomerAssignmentSchema = z.object({
  customerId: z.string().min(1),
  assignedStaffId: z.string().min(1, { message: "請選擇歸屬店長" }),
  referredByCustomerId: z.string().min(1).nullable().optional(),
});

// 批次指派直屬店長（顧客列表 sticky bar）
//   - 只動 Customer.assignedStaffId，不動 sponsorId / Booking / Transaction / Wallet
//   - 單次上限 100 筆，UI 透過當頁全選餵入
// 注意：同上，ID 改用 `.min(1)`（非空字串）；DB lookup 才是真實檢查。
export const bulkUpdateCustomerAssignmentSchema = z.object({
  customerIds: z
    .array(z.string().min(1))
    .min(1, "請選擇至少一位顧客")
    .max(100, "單次最多 100 位"),
  assignedStaffId: z.string().min(1, { message: "請選擇歸屬店長" }),
});
