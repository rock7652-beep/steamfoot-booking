import { isPreview } from "@/lib/runtime-env";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";

const PREVIEW_PROJECT = "ttworfzgwejdeolegkxl";
const PREVIEW_POOLER_HOSTS = new Set([
  "aws-0-ap-northeast-1.pooler.supabase.com",
  "aws-1-ap-northeast-1.pooler.supabase.com",
]);

function integerInRange(value: string, min: number, max: number): boolean {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) >= min && Number(value) <= max;
}

// Only supported non-routing Prisma parameters are allowed. In particular,
// host/port/user/dbname/options/search_path cannot override the checked target.
const PREVIEW_PARAMETERS: Record<string, (value: string) => boolean> = {
  schema: (value) => value === "public",
  sslmode: (value) => ["require", "verify-ca", "verify-full"].includes(value),
  sslaccept: (value) => value === "strict",
  pgbouncer: (value) => value === "true" || value === "false",
  connection_limit: (value) => integerInRange(value, 1, 100),
  connect_timeout: (value) => integerInRange(value, 0, 300),
  pool_timeout: (value) => integerInRange(value, 0, 300),
  socket_timeout: (value) => integerInRange(value, 0, 300),
  statement_cache_size: (value) => integerInRange(value, 0, 1000),
};

function isIsolatedConsultationDatabaseUrl(value: string | undefined): boolean {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || url.pathname !== "/postgres" || url.hash) return false;
    const direct = url.hostname === `db.${PREVIEW_PROJECT}.supabase.co`
      && url.username === "postgres" && ["", "5432"].includes(url.port);
    const pooled = PREVIEW_POOLER_HOSTS.has(url.hostname)
      && url.username === `postgres.${PREVIEW_PROJECT}`
      && ["", "5432", "6543"].includes(url.port);
    if (!direct && !pooled) return false;
    const seen = new Set<string>();
    for (const [key, parameter] of url.searchParams) {
      if (seen.has(key) || !Object.hasOwn(PREVIEW_PARAMETERS, key)
        || !PREVIEW_PARAMETERS[key](parameter)) return false;
      seen.add(key);
    }
    return true;
  } catch {
    return false;
  }
}

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
