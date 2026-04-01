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
  console.error("[Server Action Error]", e);
  return { success: false, error: "系統錯誤，請稍後再試" };
}
