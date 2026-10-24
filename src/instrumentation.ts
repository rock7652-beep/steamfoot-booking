/** Log-only, read-only connection verification for the isolated SPA Preview. */
export async function register() {
  // Keep Node-only database imports out of the instrumentation Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL_GIT_COMMIT_REF === "feat/store-member-link-workorder-line-20261012") {
    const { verifyStoreMemberWorkorderSchema } = await import("../scripts/store-member-workorder-review-gate.mjs");
    await verifyStoreMemberWorkorderSchema(process.env);
    return;
  }
  if (process.env.VERCEL_GIT_COMMIT_REF === "feat/music-opening-state-20261007" && (process.env.NODE_ENV !== "test" || process.env.VERCEL === "1")) {
    const { assertMusicOpeningPreviewEnvironment } = await import("../scripts/music-opening-preview-scope.mjs");
    assertMusicOpeningPreviewEnvironment(process.env);
  }

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
}
