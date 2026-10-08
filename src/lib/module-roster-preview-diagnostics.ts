import "server-only";
import { assertModuleRosterPreviewEnvironment } from "../../scripts/consultation-preview-scope.mjs";

/** Temporary, read-only diagnosis for the exact isolated steam test-store roster. */
export function allowModuleRosterPreviewDiagnostics(
  env: Readonly<Record<string, string | undefined>>,
  scope: { role: string; storeId?: string | null; pathname: string },
) {
  if (scope.role !== "ADMIN" || scope.storeId !== "staging-store" ||
      !/^\/s\/staging\/admin\/dashboard\/bookings\/?$/.test(scope.pathname)) return false;
  try { assertModuleRosterPreviewEnvironment(env); return true; }
  catch { return false; }
}
