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
  // Prisma accepts connection overrides in the query string. A loopback URL
  // must not be able to redirect a destructive disposable-schema test.
  const allowedOptions = new Set(["schema", "connection_limit", "pool_timeout", "connect_timeout", "sslmode"]);
  const seenOptions = new Set<string>();
  if (url.hash) throw new Error("Unsafe booking concurrency test database URL: fragment is forbidden");
  for (const [name, option] of url.searchParams) {
    if (!allowedOptions.has(name) || seenOptions.has(name)) {
      throw new Error("Unsafe booking concurrency test database URL: connection override or duplicate option");
    }
    seenOptions.add(name);
    const valid = name === "schema" ? /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(option)
      : name === "sslmode" ? ["disable", "prefer", "require"].includes(option)
      : /^\d{1,5}$/.test(option);
    if (!valid) throw new Error("Unsafe booking concurrency test database URL: invalid connection option");
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
