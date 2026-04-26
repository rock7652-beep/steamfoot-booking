import type { ActionResult } from "@/types";

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

/**
 * Staff-only 訊息守門：
 * 來自 requireStaffSession / requirePermission 的訊息語義針對員工，
 * 流到顧客 UI 會變成「此功能僅限員工使用」「您沒有此操作的權限」之類的紅框。
 * 顧客自助流程不該看到這些字，因為他們的入口就不應該觸發 staff guard。
 *
 * 守門策略：
 *   - 偵測到 staff-only 訊息 → 一律改回顧客可理解的訊息
 *   - 同時 server log 警告，附上堆疊，便於追查實際發起的 server action
 *   - 不破壞員工後台流程（員工本來就會看到這類訊息，只是員工 UI 自有處理）
 *     — 員工 UI 也會改成讀 friendly 訊息，但 staff layout 已 gate 過，極少觸發。
 */
const STAFF_ONLY_MESSAGES = new Set([
  "此功能僅限員工使用",
  "此功能僅限系統管理者使用",
  "此功能僅限店主使用",
  "您沒有此操作的權限",
]);

function sanitizeStaffOnlyMessage(msg: string): string | null {
  if (STAFF_ONLY_MESSAGES.has(msg)) {
    console.warn("[handleActionError] staff-only message reached customer-facing path", {
      originalMessage: msg,
      stack: new Error("staff-msg-leak-stack").stack?.split("\n").slice(2, 7).join("\n"),
    });
    return "目前無法完成此操作，請重新整理頁面再試；若持續發生，請聯繫店家協助";
  }
  return null;
}

export function handleActionError(e: unknown, ctx?: ErrorContext): ActionResult<never> {
  if (e instanceof AppError) {
    const sanitized = sanitizeStaffOnlyMessage(e.message);
    return { success: false, error: sanitized ?? e.message };
  }
  // Re-throw Next.js internal errors (e.g. redirect, notFound)
  if (
    e instanceof Error &&
    (e.message === "NEXT_REDIRECT" || e.message === "NEXT_NOT_FOUND")
  ) {
    throw e;
  }

  const msg = e instanceof Error ? e.message : String(e);

  // Dynamic import to avoid pulling prisma/db into client bundle
  // error-logger.ts imports db.ts which crashes on client-side (no DATABASE_URL)
  import("@/lib/error-logger").then(({ logError, categorizeError: catErr }) => {
    const category = catErr(msg);
    logError({
      category,
      message: msg,
      userId: ctx?.userId,
      storeId: ctx?.storeId,
      metadata: e instanceof Error ? { stack: e.stack?.substring(0, 500) } : undefined,
    });
  }).catch(() => {
    // Silently fail if error-logger can't be imported (e.g. client-side)
  });

  // Use inline categorization for the return message (no dependency on error-logger)
  const category = msg.includes("storeId")
    ? "STORE_MISSING"
    : msg.includes("FORBIDDEN") || msg.includes("權限")
    ? "PERMISSION"
    : msg.includes("UNAUTHORIZED") || msg.includes("登入")
    ? "AUTH"
    : msg.includes("Null constraint")
    ? "MISSING_FIELD"
    : msg.includes("Foreign key")
    ? "FK_VIOLATION"
    : msg.includes("Unique constraint")
    ? "UNIQUE_VIOLATION"
    : msg.includes("connect") || msg.includes("ECONNREFUSED")
    ? "DB_CONNECTION"
    : "UNKNOWN";

  return { success: false, error: USER_MESSAGES[category] ?? USER_MESSAGES.UNKNOWN };
}
