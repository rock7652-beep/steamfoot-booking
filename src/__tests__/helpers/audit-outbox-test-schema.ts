import { readFileSync } from "node:fs";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./booking-concurrency-test-db";

/** Module tests create their own module schema, but the production outbox
 * writer explicitly addresses public. Install its actual DDL only inside the
 * guarded disposable loopback test database. No delivery worker is started. */
export async function installAuditOutboxTestSchema(databaseUrl: string, db: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  resolveBookingConcurrencyTestDatabaseUrl({ BOOKING_CONCURRENCY_TEST_DATABASE_URL: databaseUrl });
  const migration = readFileSync("prisma/migrations/20261007002000_verified_audit_actor/migration.sql", "utf8");
  const ddl = migration.match(/CREATE TABLE public\."OperationAuditOutbox" \([\s\S]*?\n\);/)?.[0];
  if (!ddl) throw new Error("Audit outbox test DDL is missing");
  await db.$executeRawUnsafe(ddl.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"));
}
