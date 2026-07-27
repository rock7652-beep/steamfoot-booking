import { execSync } from "node:child_process";

const EXPECTED_MIGRATION =
  "20260727233000_add_store_line_notification_recipients";
const PROD_REF = "qijlnhtpbintanzpxkvf";
const STAGING_REF = "ttworfzgwejdeolegkxl";
const log = (message) =>
  console.log(`[ci-migrate-line-notification-recipients] ${message}`);

function projectRef(url) {
  if (!url) return null;
  return (
    url.match(/:\/\/postgres\.([a-z0-9]+):/)?.[1] ??
    url.match(/@db\.([a-z0-9]+)\.supabase\.co/)?.[1] ??
    null
  );
}

function migrationStatus() {
  try {
    return execSync("npx prisma migrate status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

function pendingMigrations(statusText) {
  const pending = [];
  let collecting = false;
  for (const raw of statusText.split("\n")) {
    const line = raw.trim();
    if (/have not yet been applied/i.test(line)) {
      collecting = true;
      continue;
    }
    if (/^(To apply|Database schema)/i.test(line)) collecting = false;
    if (collecting && /^\d{6,}_/.test(line)) pending.push(line);
  }
  return pending;
}

function main() {
  const databaseRef = projectRef(process.env.DATABASE_URL);
  const directRef = projectRef(process.env.DIRECT_URL);
  log(
    `VERCEL_ENV=${process.env.VERCEL_ENV ?? "(none)"} DATABASE_URL.ref=${databaseRef ?? "?"} DIRECT_URL.ref=${directRef ?? "?"}`,
  );

  if (process.env.VERCEL_ENV !== "production") {
    log("skip: not a production build");
    return;
  }

  const bothStaging =
    databaseRef === STAGING_REF && directRef === STAGING_REF;
  if (bothStaging) {
    log("skip: both database URLs point to staging");
    return;
  }

  if (databaseRef !== PROD_REF || directRef !== PROD_REF) {
    throw new Error(
      "Production build database URLs must both point to the approved production project",
    );
  }

  const status = migrationStatus();
  if (/Database schema is up to date/i.test(status)) {
    log("database is already up to date");
    return;
  }
  const pending = pendingMigrations(status);
  log(`pending: [${pending.join(", ")}]`);
  if (
    pending.length !== 1 ||
    pending[0] !== EXPECTED_MIGRATION
  ) {
    throw new Error(
      `Expected exactly ${EXPECTED_MIGRATION}, received ${pending.join(", ") || "(none)"}`,
    );
  }

  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  log("approved production migration applied");
}

main();
