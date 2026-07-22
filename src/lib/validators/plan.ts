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
    // 不限 cuid：正式/匯入/staging seed 的 ID 未必是 cuid（與 extendWalletExpirySchema、
    // single/trial/booking-checkout 慣例一致）。安全邊界由 assignPlanToCustomer 內
    // customer.findUnique + assertStoreAccess、plan.findUnique({isActive}) + storeId
    // guard 控制，ID 格式不是關卡。
    customerId: z.string().min(1),
    planId: z.string().min(1),
    paymentMethod: z.enum(["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID"]),
    // 後台指派方案預設代表店長已核帳；只有明確選擇 PENDING 才延後發堂。
    paymentStatus: z.enum(["CONFIRMED", "PENDING"]).optional().default("CONFIRMED"),
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
    if (data.paymentMethod === "UNPAID" && data.paymentStatus !== "PENDING") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentStatus"],
        message: "未付款的款項狀態必須為尚待確認",
      });
    }
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

// ============================================================
// migratePaperPlanSchema — PR-B 紙本舊客轉入線上
//
// 對應 server action：src/server/actions/wallet.ts → migratePaperPlan
// 對應規格：docs/staff-settlement-phase1-spec.md §3.7.9
//
// 用途：店長從紙本卡 / 舊系統把顧客的方案資料完整轉入線上。
//   - originalAmount → wallet.purchasedPrice（記錄原始實收金額；單堂金額試算用）
//   - totalSessions  → wallet.totalSessions（原始總堂數，不可被後續行為改變）
//   - usedSessions   → 轉入前已用堂數，會把對應數量的 WalletSession 標為 BACKFILLED
//   - expiryDate     → 原始紙本卡的到期日（可早於今天、可為 null = 無期限）
//
// 護欄：
//   - usedSessions ≤ totalSessions（schema superRefine）
//   - 日曆日期真實性檢查（new Date 不會 normalize）
//   - 「PAPER_MIGRATION 不可由 /dashboard/transactions 手動建立」靠
//     `createTransactionSchema.transactionType` enum 不含此值來擋；
//     本 schema 是 server action 端入口，UI 留待 PR-C。
// ============================================================
export const migratePaperPlanSchema = z
  .object({
    customerId: z.string().cuid(),
    planId: z.string().cuid(),
    // 原始實收金額（紙本卡上記載的客戶實際付款金額，非定價）
    originalAmount: z
      .number()
      .int("原始實收金額需為整數")
      .min(0, "原始實收金額不可為負數"),
    // 原始總堂數（紙本卡的「總堂數」欄位；不是線上方案的 sessionCount）
    totalSessions: z
      .number()
      .int("原始總堂數需為整數")
      .positive("原始總堂數需為正整數"),
    // 轉入前已用堂數（紙本卡上「已用」欄位；0 = 全新未開）
    usedSessions: z
      .number()
      .int("已使用堂數需為整數")
      .min(0, "已使用堂數不可為負數"),
    // 到期日（YYYY-MM-DD；null = 紙本卡無期限）
    // 紙本卡的原始到期可在過去（已過期的卡也允許入帳留紀錄）
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "到期日格式需為 YYYY-MM-DD")
      .refine((s) => {
        const [y, m, d] = s.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return (
          dt.getUTCFullYear() === y &&
          dt.getUTCMonth() === m - 1 &&
          dt.getUTCDate() === d
        );
      }, "到期日不是有效日期")
      .nullable()
      .optional(),
    // 自由備註（轉入時的補充說明；e.g. 紙本卡編號、來源）
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.usedSessions > data.totalSessions) {
      ctx.addIssue({
        code: "custom",
        path: ["usedSessions"],
        message: "已使用堂數不可超過原始總堂數",
      });
    }
  });

// ============================================================
// extendWalletExpirySchema — PR-2 顧客已持有方案「延長有效期限」
//
// 只驗格式：walletId、新到期日（YYYY-MM-DD 且為有效日曆日）、必填原因。
// 「只能延長 / 不可早於今天 / 狀態與無期限限制」屬需讀 DB 現值的商業規則，
// 由 server action extendWalletExpiry 把關，不在 schema。
// ============================================================
export const extendWalletExpirySchema = z.object({
  // 不限 cuid：正式/測試資料含非 cuid 固定 ID（如 staging seed）。
  // 安全邊界由 server action 撈 wallet + assertStoreAccess 控制，不靠 ID 格式。
  walletId: z.string().min(1, "缺少 walletId"),
  newExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "到期日格式需為 YYYY-MM-DD")
    .refine((s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    }, "到期日不是有效日期"),
  reason: z
    .string()
    .trim()
    .min(1, "請填寫延長原因")
    .max(500, "原因過長"),
});
