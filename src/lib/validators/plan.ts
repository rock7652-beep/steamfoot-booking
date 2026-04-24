import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(["TRIAL", "SINGLE", "PACKAGE"]),
  price: z.number().int().min(0),
  sessionCount: z.number().int().min(1),
  validityDays: z.number().int().min(1).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
  publicVisible: z.boolean().optional(), // 新增時可預設勾選，不指定則走 schema default false
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price: z.number().int().min(0).optional(),
  sessionCount: z.number().int().min(1).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  publicVisible: z.boolean().optional(), // PR-5：前台 /book/shop 展示開關（需搭配 isActive=true）
  sortOrder: z.number().int().optional(),
});

export const assignPlanSchema = z.object({
  customerId: z.string().cuid(),
  planId: z.string().cuid(),
  paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID"]),
  note: z.string().max(500).optional(),
  // 折扣
  discountType: z.enum(["none", "fixed", "percentage"]).optional().default("none"),
  discountValue: z.number().min(0).optional(),          // 金額 or 百分比
  discountReason: z.string().max(200).optional(),       // 折扣原因 / 活動名稱
  // PR-3：轉帳參考資訊（optional；格式驗證留待 PR-5 UI 做）
  referenceNo: z.string().max(100).optional(),          // 轉帳參考號
  bankLast5: z.string().max(10).optional(),             // 轉帳帳號末五碼
});
