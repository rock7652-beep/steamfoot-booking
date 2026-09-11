/** Build the pooled Postgres URL shared by the physically separate clients. */
export function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;

  const url = new URL(base);
  const isPooler = /pooler\.supabase\.com$/i.test(url.hostname) || url.port === "6543";
  const isServerless = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const params: Record<string, string> = {
    connection_limit: isServerless ? "1" : "5",
    pool_timeout: "10",
    connect_timeout: "10",
  };
  if (isPooler) params.pgbouncer = "true";

  for (const [key, value] of Object.entries(params)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}
