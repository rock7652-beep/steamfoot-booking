const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Return the explicit, disposable PostgreSQL test URL, or undefined when the
 * integration test was not requested. Unsafe or malformed configured values
 * fail closed without including credentials in the error.
 */
export function resolveBookingConcurrencyTestDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env.BOOKING_CONCURRENCY_TEST_DATABASE_URL;
  if (value === undefined || value === "") return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Unsafe booking concurrency test database URL: invalid URL");
  }

  if (url.protocol !== "postgresql:") {
    throw new Error("Unsafe booking concurrency test database URL: PostgreSQL is required");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Unsafe booking concurrency test database URL: loopback host is required");
  }

  const encodedDatabaseName = url.pathname.startsWith("/")
    ? url.pathname.slice(1)
    : url.pathname;
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(encodedDatabaseName);
  } catch {
    throw new Error("Unsafe booking concurrency test database URL: invalid database name");
  }
  if (!databaseName || databaseName.includes("/") || !databaseName.endsWith("_test")) {
    throw new Error("Unsafe booking concurrency test database URL: database must end with _test");
  }

  return value;
}
