import type { ActionResult } from "@/types";
import { logError, categorizeError } from "@/lib/error-logger";

// ============================================================
// Error codes
// ============================================================

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "BUSINESS_RULE"
  | "CONFLICT";

// ============================================================
// AppError — 統一的應用層錯誤
// ============================================================

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ============================================================
// handleActionError — 統一的 Server Action 錯誤回傳
// ============================================================

/** 錯誤分類 → 使用者訊息對照 */
const USER_MESSAGES: Record<string, string> = {
  STORE_MISSING: "缺少店舖資訊，請登出後重新登入",
  PERMISSION: "權限不足，無法執行此操作",
  AUTH: "登入已過期，請重新登入",
  MISSING_FIELD: "資料欄位缺失，請聯繫管理員（Null constraint）",
  FK_VIOLATION: "關聯資料不存在，請確認資料完整性",
  UNIQUE_VIOLATION: "資料重複，請勿重複操作",
  DB_CONNECTION: "資料庫連線異常，請稍後再試",
  ENV_MISSING: "系統設定缺失，請聯繫管理員",
  EXTERNAL_API: "外部服務異常，請稍後再試",
  UNKNOWN: "系統錯誤，請稍後再試",
};

export interface ErrorContext {
  userId?: string | null;
  storeId?: string | null;
}

export function handleActionError(e: unknown, ctx?: ErrorContext): ActionResult<never> {
  if (e instanceof AppError) {
    return { success: false, error: e.message };
  }
  // Re-throw Next.js internal errors (e.g. redirect, notFound)
  if (
    e instanceof Error &&
    (e.message === "NEXT_REDIRECT" || e.message === "NEXT_NOT_FOUND")
  ) {
    throw e;
  }

  const msg = e instanceof Error ? e.message : String(e);
  const category = categorizeError(msg);

  // 結構化日誌寫入（fire-and-forget）
  logError({
    category,
    message: msg,
    userId: ctx?.userId,
    storeId: ctx?.storeId,
    metadata: e instanceof Error ? { stack: e.stack?.substring(0, 500) } : undefined,
  });

  return { success: false, error: USER_MESSAGES[category] ?? USER_MESSAGES.UNKNOWN };
}
