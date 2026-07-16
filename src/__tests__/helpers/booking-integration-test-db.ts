const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Resolve only the explicit disposable database used by production-action tests. */
export function resolveBookingIntegrationTestDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env.BOOKING_INTEGRATION_TEST_DATABASE_URL;
  if (value === undefined || value === "") return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Unsafe booking integration test database URL: invalid URL");
  }
  if (url.protocol !== "postgresql:") {
    throw new Error("Unsafe booking integration test database URL: PostgreSQL is required");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Unsafe booking integration test database URL: loopback host is required");
  }

  const encodedName = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(encodedName);
  } catch {
    throw new Error("Unsafe booking integration test database URL: invalid database name");
  }
  if (!databaseName || databaseName.includes("/") || !databaseName.endsWith("_test")) {
    throw new Error("Unsafe booking integration test database URL: database must end with _test");
  }
  return value;
}
