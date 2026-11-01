
/** Build the pooled Postgres URL shared by the physically separate clients. */
export function buildDatabaseUrl(base = process.env.DATABASE_URL ?? ""): string {
  if (!base) return base;

  const url = new URL(base);
  const isPooler =
    /pooler\.supabase\.com$/i.test(url.hostname) || url.port === "6543";
  const isServerless =
    process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  // Explicit, bounded deployment tuning. With no override, preserve the URL
  // and the existing defaults. Never change the database server's pool size.
  const poolOverride=process.env.DATABASE_CONNECTION_LIMIT;
  if(poolOverride!==undefined&&poolOverride!=="1"&&poolOverride!=="2")throw new Error("DATABASE_CONNECTION_LIMIT must be 1 or 2");
  const params: Record<string, string> = {
    connection_limit: isServerless ? "1" : "5",
    pool_timeout: "10",
    connect_timeout: "10",
  };
  if (isPooler) params.pgbouncer = "true";

  for (const [key, value] of Object.entries(params)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  if(poolOverride!==undefined)url.searchParams.set("connection_limit",poolOverride);
  return url.toString();
}

/** Numeric diagnostics only; never return the URL, host or credentials. */
export function databaseConnectionPoolInfo(){
  const base=process.env.DATABASE_URL;
  if(!base)return null;
  const original=new URL(base),effective=new URL(buildDatabaseUrl(base));
  const serverless=process.env.VERCEL==="1"||Boolean(process.env.VERCEL_ENV);
  return {baseLimit:Number(original.searchParams.get("connection_limit")??(serverless?"1":"5")),effectiveLimit:Number(effective.searchParams.get("connection_limit"))};
}
