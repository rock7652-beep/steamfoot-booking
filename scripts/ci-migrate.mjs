import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
export const EXPECTED_MIGRATIONS = [
  "20260729090000_add_messenger_audit_runs",
  "20260801090000_add_transaction_payment_splits",
];
const PENDING_MIGRATIONS_HEADER =
  "Following migrations have not yet been applied:";

function abort(message) {
  console.error(`ci-migrate: abort: ${message}`);
  process.exit(1);
}

function projectRefFromConnectionString(value, variableName, expectedPort) {
  if (!value) abort(`${variableName} is missing in the Production build environment`);

  let url;
  try {
    url = new URL(value);
  } catch {
    abort(`${variableName} is not a valid PostgreSQL connection string`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    abort(`${variableName} does not use a PostgreSQL protocol`);
  }
  if (url.port !== expectedPort) {
    abort(`${variableName} is not using its approved pooler port`);
  }

  const match = url.username.match(/^postgres\.([a-z0-9]+)$/);
  if (!match) abort(`${variableName} does not identify a Supabase project ref`);
  return match[1];
}

function runPrisma(args, allowFailure = false) {
  try {
    return {
      exitCode: 0,
      output: execFileSync("npx", ["prisma", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (allowFailure) return { exitCode: error.status ?? 1, output };
    process.stderr.write(output);
    abort(`prisma ${args.join(" ")} failed`);
  }
}

export function pendingMigrations(statusOutput) {
  const headerIndex = statusOutput.indexOf(PENDING_MIGRATIONS_HEADER);
  if (headerIndex === -1) return [];

  const pendingSection = statusOutput.slice(
    headerIndex + PENDING_MIGRATIONS_HEADER.length,
  );
  return readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((name) => ({ name, index: pendingSection.indexOf(name) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.name);
}

export function hasExpectedMigrations(pending) {
  return (
    pending.length === EXPECTED_MIGRATIONS.length &&
    pending.every((name, index) => name === EXPECTED_MIGRATIONS[index])
  );
}

function main() {
  if (process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT) {
    console.log("ci-migrate: skipped outside Vercel Production");
    return;
  }

  const databaseRef = projectRefFromConnectionString(
    process.env.DATABASE_URL,
    "DATABASE_URL",
    "6543",
  );
  const directRef = projectRefFromConnectionString(
    process.env.DIRECT_URL,
    "DIRECT_URL",
    "5432",
  );
  if (databaseRef !== EXPECTED_PROJECT_REF || directRef !== EXPECTED_PROJECT_REF) {
    abort("connection strings do not both target the approved Production project");
  }

  const status = runPrisma(["migrate", "status"], true);
  const pending = pendingMigrations(status.output);
  if (
    status.exitCode === 0 &&
    status.output.includes("Database schema is up to date")
  ) {
    console.log("ci-migrate: approved migrations are already applied; skipping deploy");
    return;
  }

  if (
    status.exitCode !== 1 ||
    !status.output.includes(PENDING_MIGRATIONS_HEADER) ||
    !hasExpectedMigrations(pending)
  ) {
    process.stderr.write(status.output);
    abort(
      `expected fixed pending migration sequence: ${EXPECTED_MIGRATIONS.join(", ")}`,
    );
  }

  console.log(
    `ci-migrate: applying fixed migration sequence: ${EXPECTED_MIGRATIONS.join(", ")}`,
  );
  const deploy = runPrisma(["migrate", "deploy"]);
  process.stdout.write(deploy.output);

  const postStatus = runPrisma(["migrate", "status"], true);
  if (postStatus.exitCode !== 0 || !postStatus.output.includes("Database schema is up to date")) {
    process.stderr.write(postStatus.output);
    abort("schema was not up to date after migration deploy");
  }
  console.log("ci-migrate: schema is up to date");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
