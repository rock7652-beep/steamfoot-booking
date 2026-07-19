const STAGING_PROJECT_REF = "ttworfzgwejdeolegkxl";
const PRODUCTION_PROJECT_REF = "qijlnhtpbintanzpxkvf";

export type Pr2PreviewSmokeGuardReason =
  | "NOT_PREVIEW"
  | "DATABASE_URL_MISSING"
  | "DIRECT_URL_MISSING"
  | "DATABASE_REF_UNREADABLE"
  | "DIRECT_REF_UNREADABLE"
  | "DATABASE_REF_MISMATCH"
  | "DIRECT_REF_MISMATCH"
  | "PRODUCTION_REF_DETECTED";

function projectRefStatus(value: string): "staging" | "production" | "mismatch" | "unreadable" {
  try {
    const parsed = new URL(value);
    // Supabase direct URLs place the ref in the hostname; pooler URLs place it
    // in the PostgreSQL username (for example postgres.<project-ref>).
    const labels = [...parsed.hostname.split("."), ...parsed.username.split(".")];
    if (labels.includes(PRODUCTION_PROJECT_REF)) return "production";
    return labels.includes(STAGING_PROJECT_REF) ? "staging" : "mismatch";
  } catch { return "unreadable"; }
}

/** Returns a non-sensitive code only; callers must never include URLs in responses or logs. */
export function pr2PreviewSmokeGuardReason(): Pr2PreviewSmokeGuardReason | null {
  if (process.env.VERCEL_ENV !== "preview") return "NOT_PREVIEW";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const directUrl = process.env.DIRECT_URL ?? "";
  if (!databaseUrl) return "DATABASE_URL_MISSING";
  if (!directUrl) return "DIRECT_URL_MISSING";
  const database = projectRefStatus(databaseUrl);
  const direct = projectRefStatus(directUrl);
  if (database === "production" || direct === "production") return "PRODUCTION_REF_DETECTED";
  if (database === "unreadable") return "DATABASE_REF_UNREADABLE";
  if (direct === "unreadable") return "DIRECT_REF_UNREADABLE";
  if (database !== "staging") return "DATABASE_REF_MISMATCH";
  if (direct !== "staging") return "DIRECT_REF_MISMATCH";
  return null;
}

/** Shared guard for temporary Preview-only actions and route handlers. */
export function assertPr2PreviewSmokeRuntime() {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) throw new Error(reason);
}
