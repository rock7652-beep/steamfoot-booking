/**
 * REVIEW ONLY. No apply mode, schema migration, entitlement write, or contact data.
 * This script has NOT been run against any database as part of this milestone.
 * See docs/sports-shared-card-initialization.md before any separately approved run.
 */
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  planSportsSharedCardInitialization,
  type SharedCardInitializationStore,
} from "../src/lib/course-shared-card-initialization";

type SnapshotRow = Omit<SharedCardInitializationStore, "sharedCardOverride"> & {
  overrideId: string | null;
  overrideStatus: string | null;
  overrideStartsAt: Date | null;
  overrideExpiresAt: Date | null;
};

const USAGE = "Requires exactly --dry-run and an explicitly supplied SHARED_CARD_INITIALIZATION_DATABASE_URL. No apply mode exists.";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(USAGE);
    return;
  }
  // Reject every other flag, including --apply, before creating a client.
  if (args.length !== 1 || args[0] !== "--dry-run") throw new Error(USAGE);
  const databaseUrl = process.env.SHARED_CARD_INITIALIZATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error(USAGE);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("The dedicated database URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("The dedicated database URL must use PostgreSQL");
  }

  // Isolated client: never import the application singleton or its URL helpers.
  // Do not print the URL or database errors; either can expose credentials.
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [snapshot] = await tx.$queryRaw<{ snapshotAt: Date; readOnly: string }[]>`
        SELECT transaction_timestamp() AS "snapshotAt",
          current_setting('transaction_read_only') AS "readOnly"`;
      if (!snapshot || snapshot.readOnly !== "on") {
        throw new Error("Read-only transaction was not confirmed");
      }
      const rows = await tx.$queryRaw<SnapshotRow[]>`
        SELECT s.id AS "storeId", s."industryModule"::text AS "industryModule",
          EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" m
            WHERE m."storeId" = s.id AND m."featureKey" = 'business.music'
              AND m.status::text = 'ENABLED') AS "musicEnabled",
          (SELECT COUNT(*)::int FROM "CoursePointPlan" p
            WHERE p."storeId" = s.id AND p."allowShared" = true) AS "sharedPlanCount",
          (SELECT COUNT(*)::int FROM "CoursePointPlan" p
            WHERE p."storeId" = s.id AND p."allowShared" = true
              AND p."isActive" = true) AS "activeSharedPlanCount",
          e.id AS "overrideId", e.status::text AS "overrideStatus",
          e."startsAt" AS "overrideStartsAt", e."expiresAt" AS "overrideExpiresAt"
        FROM "Store" s
        LEFT JOIN "StoreFeatureEntitlement" e
          ON e."storeId" = s.id AND e."featureKey" = 'shared_card'
        ORDER BY s.id`;
      return planSportsSharedCardInitialization(rows.map((row) => ({
        storeId: row.storeId,
        industryModule: row.industryModule,
        musicEnabled: row.musicEnabled,
        sharedPlanCount: row.sharedPlanCount,
        activeSharedPlanCount: row.activeSharedPlanCount,
        sharedCardOverride: row.overrideId === null ? null : {
          id: row.overrideId,
          status: row.overrideStatus ?? "UNKNOWN",
          startsAt: row.overrideStartsAt,
          expiresAt: row.overrideExpiresAt,
        },
      })), snapshot.snapshotAt);
    }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 30_000 });
    console.log(JSON.stringify(plan, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

// Importing this file never connects. Execution requires an explicit CLI invocation.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // No raw exception messages, SQL parameters, connection details, or contacts.
    console.error(`Shared-card planning failed; no initialization was applied. ${USAGE}`);
    process.exitCode = 1;
  });
}
