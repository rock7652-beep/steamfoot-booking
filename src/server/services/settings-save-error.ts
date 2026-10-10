import { AppError } from "@/lib/errors";
import { z } from "zod";

/** Only definite validation/rolled-back constraints unlock a different payload. */
export function settingsSaveUncertain(error:unknown) {
  if(error instanceof AppError||error instanceof z.ZodError)return false;
  const code=error&&typeof error==="object"&&"code" in error?error.code:null;
  return !["P2002","P2003","P2025"].includes(String(code));
}
