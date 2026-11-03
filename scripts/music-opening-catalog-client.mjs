/** A single, short-lived connection for the read-only catalog capability check.
 * Avoid a second Prisma query-engine pool during serverless instrumentation.
 * The caller validates the exact isolated target before this factory is invoked.
 */
export function createMusicOpeningCatalogClient(options, Client) {
  const client = new Client({
    connectionString: options.datasources.db.url,
    connectionTimeoutMillis: 30_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    application_name: "music-preview-schema-check",
  });
  // Idle transport errors must not become unhandled events. connect/query still
  // reject normally and the preflight classifies them without logging credentials.
  client.on("error", () => {});
  return {
    $connect: () => client.connect(),
    $queryRawUnsafe: async sql => (await client.query({ text: sql })).rows,
    $disconnect: () => client.end(),
  };
}
