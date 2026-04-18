import { z } from "zod";

/**
 * 顧客基本資料 validator
 *
 * 新規則：除 notes 外，其餘基本身份資料皆必填。
 * - DB schema 仍保留 nullable（舊資料允許缺漏）
 * - 這層 zod 是 app-level 必填，新資料從此必須完整
 */

// 後台新增顧客（staff 建立）
export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^09\d{8}$/, "手機號碼格式不正確（09 開頭共 10 碼）"),
  email: z.string().trim().email("Email 格式不正確").max(200),
  gender: z.enum(["male", "female", "other"], { required_error: "請選擇性別" }),
  birthday: z.string().trim().min(1, "請選擇生日"), // ISO date string
  // lineName / notes 可空
  lineName: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  // 後台建立時可稍後指派
  assignedStaffId: z.string().cuid().optional(),
});

// 後台編輯顧客（全欄位更新）
export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^09\d{8}$/, "手機號碼格式不正確（09 開頭共 10 碼）"),
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
