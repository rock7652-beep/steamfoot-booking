const STAGING_PROJECT_REF = "ttworfzgwejdeolegkxl";
const PRODUCTION_PROJECT_REF = "qijlnhtpbintanzpxkvf";

function hasProjectRef(value: string, projectRef: string) {
  try { return new URL(value).hostname.split(".").includes(projectRef); }
  catch { return false; }
}

/** Shared guard for temporary Preview-only actions and route handlers. */
export function assertPr2PreviewSmokeRuntime() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const directUrl = process.env.DIRECT_URL ?? "";
  if (
    process.env.VERCEL_ENV !== "preview"
    || hasProjectRef(databaseUrl, PRODUCTION_PROJECT_REF)
    || hasProjectRef(directUrl, PRODUCTION_PROJECT_REF)
    || !hasProjectRef(databaseUrl, STAGING_PROJECT_REF)
    || !hasProjectRef(directUrl, STAGING_PROJECT_REF)
  ) throw new Error("PR2_SMOKE_PREVIEW_RUNTIME_REQUIRED");
}
