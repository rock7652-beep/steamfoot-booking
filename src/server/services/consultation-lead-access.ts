import { isPreview } from "@/lib/runtime-env";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";

import { isIsolatedConsultationDatabaseUrl } from "../../../scripts/consultation-preview-scope.mjs";

/** Pure configuration guard: never opens a database or reports its credentials. */
export function consultationDatabaseAllowed(): boolean {
  if (process.env.CONSULTATION_PREVIEW_INTAKE_ENABLED === "true" && !isPreview()) return false;
  if (!trialApplicationDatabaseAllowed()) return false;
  if (!isPreview()) return true;
  // Both existing connection settings must target the same isolated project.
  // This helper does not retrieve, create, or change either setting.
  return isIsolatedConsultationDatabaseUrl(process.env.DATABASE_URL)
    && isIsolatedConsultationDatabaseUrl(process.env.DIRECT_URL);
}

export function consultationPreviewIntakeEnabled(): boolean {
  return isPreview() && process.env.CONSULTATION_PREVIEW_INTAKE_ENABLED === "true";
}
