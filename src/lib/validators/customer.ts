import { z } from "zod";
import { normalizePhone } from "@/lib/normalize";

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
  birthday: emptyToUndef.pipe(z.string().trim().optional()),
  // lineName / notes 可空
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  // 後台建立時可稍後指派
  assignedStaffId: z.string().cuid().optional(),
});

// 後台編輯顧客（全欄位更新）
export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(100),
  phone: phoneSchema,
  email: z.string().trim().email("Email 格式不正確").max(200),
  gender: z.enum(["male", "female", "other"], { required_error: "請選擇性別" }),
  birthday: z.string().trim().min(1, "請選擇生日"),
  height: z.number().min(50).max(250),
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

// 顧客歸屬設定（列表 drawer 用）
//   - assignedStaffId：直屬店長（必填）
//   - referredByCustomerId：推薦人（選填；null = 清除）
export const updateCustomerAssignmentSchema = z.object({
  customerId: z.string().cuid(),
  assignedStaffId: z.string().cuid({ message: "請選擇歸屬店長" }),
  referredByCustomerId: z.string().cuid().nullable().optional(),
});
