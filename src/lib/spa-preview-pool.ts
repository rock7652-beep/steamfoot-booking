/** Narrow runtime repair for the verified SPA Preview database; never used by migrations. */
export function configureSpaPreviewPool(url: URL): boolean {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "codex/hq-module-foundation" ||
    url.hostname !== "aws-1-ap-northeast-1.pooler.supabase.com" ||
    url.username !== "postgres.ttworfzgwejdeolegkxl" ||
    !["5432", "6543"].includes(url.port)
  )
    return false;
  url.port = "6543";
  url.searchParams.set("pgbouncer", "true");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "10");
  url.searchParams.set("connect_timeout", "10");
  return true;
}
