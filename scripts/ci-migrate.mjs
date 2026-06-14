// scripts/ci-migrate.mjs
//
// 一次性 production migration runner（在 Vercel build 內執行）。
// 設計詳見 docs/store-subscription-vercel-one-time-migration-plan.md。
//
// 安全閘門（全部通過才會跑 migrate）：
//   1. 只在 Vercel production build 執行（VERCEL_ENV === "production"）
//      → preview / development / 本機 一律 skip（不跑 prod migration）。
//   2. DATABASE_URL / DIRECT_URL 的 project ref 必須剛好是 prod（qijlnhtpbintanzpxkvf）；
//      含 staging ref 或非 prod 一律 skip（絕不對 staging 跑）。
//   3. pending migration 必須「剛好只有」EXPECTED_MIGRATION；
//      不符（0 筆其他 / 多筆 / 不同名）→ build fail（exit 1）。
//   4. 已是最新 → no-op skip（套用後未來部署不再重跑）。
//
// 一律用 `prisma migrate deploy`（canonical，會寫 _prisma_migrations）；
// 不用 db execute、不 reset 密碼、不改 Vercel env、不印任何連線字串。

import { execSync } from "node:child_process";

const EXPECTED_MIGRATION = "20260614_add_subscription_payment_method";
const PROD_REF = "qijlnhtpbintanzpxkvf";
const STAGING_REF = "ttworfzgwejdeolegkxl";

const log = (m) => console.log(`[ci-migrate] ${m}`);

/** 從連線字串取 Supabase project ref（不回傳/不印密碼）。 */
function refOf(url) {
  if (!url) return null;
  const pooler = url.match(/:\/\/postgres\.([a-z0-9]+):/); // postgres.<ref>:***@pooler
  if (pooler) return pooler[1];
  const direct = url.match(/@db\.([a-z0-9]+)\.supabase\.co/); // db.<ref>.supabase.co
  if (direct) return direct[1];
  return null;
}

function runStatus() {
  try {
    return execSync("npx prisma migrate status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // migrate status 有 pending 時 exit code 非 0，輸出仍在 stdout
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

function parsePending(statusText) {
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
  const vercelEnv = process.env.VERCEL_ENV ?? "(none)";
  const dbRef = refOf(process.env.DATABASE_URL);
  const directRef = refOf(process.env.DIRECT_URL);
  log(`VERCEL_ENV=${vercelEnv} DATABASE_URL.ref=${dbRef ?? "?"} DIRECT_URL.ref=${directRef ?? "?"}`);

  // Gate 1：只在 production build
  if (vercelEnv !== "production") {
    log("skip：非 production build（preview/dev/local）→ 不跑 prod migration");
    return;
  }

  // Gate 2：project ref 必須是 prod，且不得含 staging ref
  if (dbRef === STAGING_REF || directRef === STAGING_REF) {
    log("skip：偵測到 staging ref → 拒絕對 staging 跑 prod migration");
    return;
  }
  if (dbRef !== PROD_REF || directRef !== PROD_REF) {
    log(`skip：project ref 非 prod（${PROD_REF}）→ 不執行`);
    return;
  }

  // Gate 3/4：檢查 pending
  const status = runStatus();
  if (/Database schema is up to date/i.test(status)) {
    log("已是最新 → 無 pending，no-op（migration 先前已套用）");
    return;
  }
  const pending = parsePending(status);
  log(`pending: [${pending.join(", ")}]`);
  if (pending.length !== 1 || pending[0] !== EXPECTED_MIGRATION) {
    log(`ABORT（build fail）：pending 必須剛好只有 [${EXPECTED_MIGRATION}]`);
    process.exit(1);
  }

  // 通過 → 套用唯一這支 migration（canonical migrate deploy）
  log(`套用 ${EXPECTED_MIGRATION} … (prisma migrate deploy)`);
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  log("migration 已套用 ✓");
}

main();
