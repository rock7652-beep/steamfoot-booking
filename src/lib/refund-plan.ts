/**
 * 退款計畫計算（pure function，無 DB / session 相依）
 *
 * 規格 v2：退款不修改原交易，新增一筆負向 REFUND tx + 連動 wallet/walletSession。
 * 本檔案負責「給定原交易與 wallet 狀態 → 算出能不能退、退多少、要 void 哪些 session」。
 * Server action 拿這個結果再進 DB transaction 寫入。
 *
 * 因為純函式，可單元測試覆蓋 4 個禁止情境 + 計算 edge cases，不需 DB。
 */

export type RefundMode = "FULL_UNUSED" | "REMAINING_SESSIONS";

export interface SessionLite {
  id: string;
  status: "AVAILABLE" | "RESERVED" | "COMPLETED" | "VOIDED";
}

export interface RefundPlanInput {
  /** 原 PACKAGE_PURCHASE 交易實收金額（正整數，與 DB Decimal(10,0) 對應） */
  originalAmount: number;
  /** 原方案總堂數（>0） */
  totalSessions: number;
  /** 退款模式 */
  mode: RefundMode;
  /** 該 wallet 所有 session 列表 */
  sessions: SessionLite[];
}

export type RefundPlanResult =
  | {
      ok: true;
      /** 退款金額（正整數，存入 REFUND tx 時要轉負） */
      refundAmount: number;
      /** 要被標 VOIDED 的 session id 列表 */
      sessionIdsToVoid: string[];
      /** 試算說明（給 UI 顯示） */
      breakdown: {
        unitPrice: number;
        availableCount: number;
        completedCount: number;
        reservedCount: number;
      };
    }
  | {
      ok: false;
      /** AppError code 對應 */
      errorCode: "BUSINESS_RULE" | "VALIDATION";
      /** 給使用者看的訊息（規格 v2 sec 七固定文案） */
      message: string;
    };

/**
 * 規格固定文案（spec sec 七 防呆訊息）
 */
export const REFUND_ERROR_MESSAGES = {
  HAS_RESERVED: "此方案仍有未完成預約，請先取消預約後再退款。",
  HAS_COMPLETED_FULL: "此方案已有完成服務紀錄，不能全額退款。",
  HAS_COMPLETED_AUTO: "此方案已有完成服務紀錄，如需退款請使用人工退款流程。",
  NO_AVAILABLE: "目前沒有可退款堂數。",
  INVALID_TOTAL_SESSIONS: "原方案總堂數不正確（必須 > 0）",
  INVALID_AMOUNT: "原方案金額不正確",
} as const;

/**
 * 計算退款計畫（pure）
 *
 * 邏輯（spec sec 三 + 四）：
 *   - 任何模式：reserved > 0 → 拒絕，先取消預約
 *   - FULL_UNUSED 模式：completed > 0 → 拒絕全額退款
 *   - 算 unitPrice = round(originalAmount / totalSessions)
 *   - FULL_UNUSED → refundAmount = originalAmount
 *   - REMAINING_SESSIONS → refundAmount = unitPrice * availableCount
 *   - availableCount === 0 → 拒絕（沒可退）
 *
 * 注意：
 *   - 既有 VOIDED session 不影響本次計算（已退過 / 已作廢）
 *   - REMAINING_SESSIONS 模式不檢查 completedCount > 0；可以「有用過、退剩下的」
 */
export function computeRefundPlan(input: RefundPlanInput): RefundPlanResult {
  if (input.totalSessions <= 0) {
    return { ok: false, errorCode: "VALIDATION", message: REFUND_ERROR_MESSAGES.INVALID_TOTAL_SESSIONS };
  }
  if (input.originalAmount < 0) {
    return { ok: false, errorCode: "VALIDATION", message: REFUND_ERROR_MESSAGES.INVALID_AMOUNT };
  }

  const availableCount = input.sessions.filter((s) => s.status === "AVAILABLE").length;
  const reservedCount = input.sessions.filter((s) => s.status === "RESERVED").length;
  const completedCount = input.sessions.filter((s) => s.status === "COMPLETED").length;

  // 任何模式：有預約就先取消
  if (reservedCount > 0) {
    return { ok: false, errorCode: "BUSINESS_RULE", message: REFUND_ERROR_MESSAGES.HAS_RESERVED };
  }

  // FULL_UNUSED 模式：有完成堂數 → 不允許全額退款
  if (input.mode === "FULL_UNUSED" && completedCount > 0) {
    return { ok: false, errorCode: "BUSINESS_RULE", message: REFUND_ERROR_MESSAGES.HAS_COMPLETED_FULL };
  }

  // 沒有可退款堂數
  if (availableCount === 0) {
    return { ok: false, errorCode: "BUSINESS_RULE", message: REFUND_ERROR_MESSAGES.NO_AVAILABLE };
  }

  // 算金額
  const unitPrice = Math.round(input.originalAmount / input.totalSessions);
  const refundAmount =
    input.mode === "FULL_UNUSED" ? input.originalAmount : unitPrice * availableCount;

  return {
    ok: true,
    refundAmount,
    sessionIdsToVoid: input.sessions.filter((s) => s.status === "AVAILABLE").map((s) => s.id),
    breakdown: { unitPrice, availableCount, completedCount, reservedCount },
  };
}
