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

export const assignPlanSchema = z
  .object({
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
    // 有效期限模式（紙本卡轉線上：店長可覆寫此次指派的 wallet 到期日）
    // PLAN_DEFAULT：用 plan.validityDays（無 → 無期限）
    // CUSTOM_DURATION：以「台灣今天」+ N 天/週/月計算
    // CUSTOM_DATE：直接使用店長指定的 YYYY-MM-DD
    // 「不可早於台灣今天」的時間戳檢查由 server action 做（schema 不依賴 Date.now）
    expiryMode: z
      .enum(["PLAN_DEFAULT", "CUSTOM_DURATION", "CUSTOM_DATE"])
      .optional()
      .default("PLAN_DEFAULT"),
    customExpiryValue: z.number().int().optional(),
    customExpiryUnit: z.enum(["DAY", "WEEK", "MONTH"]).optional(),
    customExpiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.expiryMode === "CUSTOM_DURATION") {
      if (data.customExpiryValue == null || data.customExpiryValue <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["customExpiryValue"],
          message: "期限數值需大於 0",
        });
      }
      if (!data.customExpiryUnit) {
        ctx.addIssue({
          code: "custom",
          path: ["customExpiryUnit"],
          message: "請選擇期限單位",
        });
      }
    }
    if (data.expiryMode === "CUSTOM_DATE") {
      if (!data.customExpiryDate) {
        ctx.addIssue({
          code: "custom",
          path: ["customExpiryDate"],
          message: "請指定到期日",
        });
      }
    }
  });
