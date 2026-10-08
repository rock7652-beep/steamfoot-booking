import "server-only";
import { assertModuleRosterPreviewEnvironment } from "../../scripts/consultation-preview-scope.mjs";

/** Server-only eligibility. The client also requires the live exact roster path. */
export function allowModuleRosterPreviewDiagnostics(
  env: Readonly<Record<string, string | undefined>>,
  scope: { role: string; storeId?: string | null },
) {
  if (scope.role !== "ADMIN" || scope.storeId !== "staging-store") return false;
  try { assertModuleRosterPreviewEnvironment(env); return true; }
  catch { return false; }
}
