/** Log-only, read-only connection verification for the isolated SPA Preview. */
export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "codex/hq-module-foundation"
  )
    return;
  const { configureSpaPreviewPool } = await import("./lib/spa-preview-pool");
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    return;
  }
  if (!configureSpaPreviewPool(url)) return;
  const [{ prisma }, { spaPrisma }] = await Promise.all([
    import("./lib/db"),
    import("./lib/spa-db"),
  ]);
  const results = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1 AS ok`,
    spaPrisma.$queryRaw`SELECT 1 AS ok FROM "SpaServiceLocation" LIMIT 1`,
  ]);
  const status = {
    main: results[0].status === "fulfilled",
    spa: results[1].status === "fulfilled",
    port: url.port,
    mode: "transaction",
  };
  if (status.main && status.spa)
    console.info("[spa-preview-pool] verified", status);
  else console.error("[spa-preview-pool] verification failed", status);
}
