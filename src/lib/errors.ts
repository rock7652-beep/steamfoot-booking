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

export function handleActionError(e: unknown): ActionResult<never> {
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

  // Categorized Prisma / DB error logging
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Null constraint violation")) {
    console.error("[Server Action Error][MISSING_FIELD]", msg, e);
    return { success: false, error: "資料欄位缺失，請聯繫管理員（Null constraint）" };
  }
  if (msg.includes("Foreign key constraint") || msg.includes("violates foreign key")) {
    console.error("[Server Action Error][FK_VIOLATION]", msg, e);
    return { success: false, error: "關聯資料不存在，請確認資料完整性" };
  }
  if (msg.includes("Unique constraint")) {
    console.error("[Server Action Error][UNIQUE_VIOLATION]", msg, e);
    return { success: false, error: "資料重複，請勿重複操作" };
  }
  if (msg.includes("FORBIDDEN")) {
    console.error("[Server Action Error][PERMISSION]", msg);
    return { success: false, error: "權限不足，無法執行此操作" };
  }

  console.error("[Server Action Error][UNKNOWN]", e);
  return { success: false, error: "系統錯誤，請稍後再試" };
}
