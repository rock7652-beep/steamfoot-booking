import { Prisma } from "@prisma/client";

/** Returns a concise, actionable error without exposing Prisma's invocation. */
export function digitalButlerPublishErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "流程版本發生衝突（P2002），請重新整理後再試。";
    }
    if (error.code === "P2034") {
      return "流程發布遇到並行更新（P2034），請重新整理後再試。";
    }
    return `流程發布的資料庫操作失敗（${error.code}）。`;
  }
  return error instanceof Error ? error.message : "操作失敗";
}
