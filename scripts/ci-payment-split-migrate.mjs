import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./ci-migrate.mjs";

const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf";
export const PAYMENT_SPLIT_MIGRATION =
  "20260801090000_add_transaction_payment_splits";

function abort(message) {
  console.error(`payment-split-migration: abort: ${message}`);
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

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
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
    if (allowFailure) {
      return {
        exitCode: error.status ?? 1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      };
    }
    abort(`prisma ${args.join(" ")} failed`);
  }
}

export function hasOnlyPaymentSplitPending(statusOutput) {
  const pending = pendingMigrations(statusOutput);
  return pending.length === 1 && pending[0] === PAYMENT_SPLIT_MIGRATION;
}

function main() {
  if (process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT) {
    abort("only Vercel Production may run the payment-split migration");
  }
  if (process.argv.length !== 2) abort("this single-purpose tool accepts no arguments");

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
  if (status.exitCode !== 1 || !hasOnlyPaymentSplitPending(status.output)) {
    abort("expected exactly one pending payment-split migration");
  }

  console.log("payment-split-migration: applying fixed payment-split migration");
  runPrisma(["migrate", "deploy"]);

  const after = runPrisma(["migrate", "status"], true);
  if (after.exitCode !== 0 || !after.output.includes("Database schema is up to date")) {
    abort("schema was not up to date after payment-split migration deploy");
  }
  console.log("payment-split-migration: schema is up to date");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
