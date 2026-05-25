/**
 * healthflow-link-execute.ts — PR-H2b-2
 *
 * 把 PR-H2b-1 (`healthflow-link-dryrun.ts`) 找出的 AUTO_LINK_CANDIDATE 寫入
 * `Customer.healthProfileId`，讓顧客可以在 LIFF `/liff/health` 看自己的健康摘要。
 *
 * 與 PR-H2b-1 共存不取代：
 *   - PR-H2b-1 (`healthflow-link-dryrun.ts`)：完整 7-bucket 報表，純讀
 *   - PR-H2b-2 (本檔)：聚焦 AUTO_LINK_CANDIDATE，預設仍 dry-run，--execute 才寫
 *
 * 設計規則（per 用戶拍板 A/A/B）：
 *   - default = dry-run（印出「會寫什麼」，不寫 DB）
 *   - `--execute` 才寫入
 *   - 只寫 AUTO_LINK_CANDIDATE，其他 bucket 一律 skip
 *   - `--max-writes N` 必填（when --execute）；AUTO_LINK_CANDIDATE 數量 > N → 整批 refuse，不部分寫入
 *   - CAS 寫入：`updateMany WHERE healthProfileId IS NULL AND healthLinkStatus IN [unlinked, not_found, error]`
 *     count=0 視為 CAS_LOST（並行寫入或資料變化）→ skip + log，不 throw 中斷
 *   - 寫入欄位：`healthProfileId / healthLinkStatus="linked" / healthSyncedAt=now`
 *   - Idempotent：第二次跑 --execute 應為 0 寫入（CAS 條件保護）
 *
 * Classify 邏輯重用 PR-H2b-1 (拍板 A: single source of truth)：
 *   - import classify / Bucket / Row / CustomerSlim from './healthflow-link-dryrun'
 *   - dryrun script 已加 entrypoint gate，import 不會觸發 main()
 *
 * 完全 read-only（dry-run mode） / 受控 write（execute mode）：
 *   ❌ 不 import linkHealthProfile / tryAutoLinkHealth / unlinkHealthProfile
 *   ❌ 不動 schema / migration
 *   ❌ 不動 LIFF / booking / wallet / dashboard
 *   ❌ 不改 HealthFlow API contract
 *   ✅ 對 Customer：dry-run = SELECT only；execute = updateMany w/ CAS
 *
 * Usage:
 *   # dry-run（預設）
 *   npx tsx scripts/healthflow-link-execute.ts --yes-i-checked-db
 *   npx tsx scripts/healthflow-link-execute.ts --yes-i-checked-db --customerId cm...
 *   npx tsx scripts/healthflow-link-execute.ts --yes-i-checked-db --storeSlug zhubei
 *
 *   # execute（需 --max-writes）
 *   npx tsx scripts/healthflow-link-execute.ts --yes-i-checked-db --execute --max-writes 8
 *   npx tsx scripts/healthflow-link-execute.ts --yes-i-checked-db --execute --max-writes 10 --customerId cm...
 */

import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";
import {
  classify,
  type Bucket,
  type CustomerSlim,
  type Row,
} from "./healthflow-link-dryrun";

// ──────────────────────────────────────────
// CLI parsing + safety
// ──────────────────────────────────────────

function describeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port || "default",
      database: u.pathname.slice(1),
      user: u.username,
    };
  } catch {
    return null;
  }
}

function printBanner(execute: boolean, maxWrites: number | null) {
  const info = describeDatabaseUrl();
  console.log("=".repeat(72));
  console.log(`Mode: ${execute ? "🔴 EXECUTE (將寫入 DB)" : "🟢 DRY-RUN (不寫入)"}`);
  if (execute) console.log(`  --max-writes = ${maxWrites}`);
  console.log("=".repeat(72));
  console.log(`  host=${info?.host} port=${info?.port} db=${info?.database} user=${info?.user}`);
  console.log(`  HEALTH_API_URL set : ${process.env.HEALTH_API_URL ? "yes" : "NO"}`);
  console.log(`  HEALTH_API_KEY set : ${process.env.HEALTH_API_KEY ? "yes" : "NO"}`);
  console.log("");
}

function abortWithoutConfirm(): never {
  console.error("⛔  未帶 --yes-i-checked-db，abort（dry-run 也是純讀，但先確認環境）");
  process.exit(2);
}

interface Args {
  yesChecked: boolean;
  execute: boolean;
  maxWrites: number | null;
  customerId: string | null;
  storeSlug: string | null;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    yesChecked: false,
    execute: false,
    maxWrites: null,
    customerId: null,
    storeSlug: null,
    limit: 1000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--yes-i-checked-db") args.yesChecked = true;
    else if (a === "--execute") args.execute = true;
    else if (a === "--max-writes" && next) {
      const n = parseInt(next, 10);
      // 接受 >= 0；0 是合法值（顯式 "拒絕一切寫入"，有 candidate 就 refuse）
      if (Number.isInteger(n) && n >= 0) args.maxWrites = n;
    } else if (a === "--customerId" && next) args.customerId = next;
    else if (a === "--storeSlug" && next) args.storeSlug = next;
    else if (a === "--limit" && next) args.limit = parseInt(next, 10) || 1000;
  }
  return args;
}

// ──────────────────────────────────────────
// Write logs
// ──────────────────────────────────────────

interface WriteOutcome {
  customerId: string;
  customerName: string;
  storeSlug: string;
  profileId: string;
  beforeStatus: string;
  result: "WRITTEN" | "CAS_LOST" | "WOULD_WRITE" | "REFUSED_MAX_WRITES";
}

// ──────────────────────────────────────────
// main
// ──────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.yesChecked) {
    printBanner(args.execute, args.maxWrites);
    abortWithoutConfirm();
  }

  // --execute 必帶 --max-writes（拍板 B：安全閥）
  if (args.execute && args.maxWrites === null) {
    printBanner(args.execute, args.maxWrites);
    console.error("⛔  --execute 必帶 --max-writes <N>（防止意外大量寫入）");
    console.error("    例如：--execute --max-writes 8");
    process.exit(2);
  }

  printBanner(args.execute, args.maxWrites);

  const prisma = new PrismaClient();
  try {
    // ── 1. Build query ──
    // dry-run 模式可以掃整批；execute 模式同範圍但寫入只挑 AUTO_LINK_CANDIDATE。
    const baseWhere = {
      mergedIntoCustomerId: null,
      OR: [
        { healthProfileId: null },
        { healthLinkStatus: { in: ["unlinked", "not_found", "error"] } },
      ],
    };

    let where: Record<string, unknown> = baseWhere;
    if (args.customerId) {
      where = { id: args.customerId };
    } else if (args.storeSlug) {
      const store = await prisma.store.findUnique({
        where: { slug: args.storeSlug },
        select: { id: true },
      });
      if (!store) {
        console.error(`⛔  找不到 store slug=${args.storeSlug}`);
        process.exit(1);
      }
      where = { ...baseWhere, storeId: store.id };
    }

    // ── 2. Fetch customers ──
    const customers: CustomerSlim[] = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        healthLinkStatus: true,
        store: { select: { slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: args.limit,
    });

    console.log(`掃描範圍：${customers.length} 筆 Customer`);
    if (args.customerId) console.log(`  --customerId = ${args.customerId}`);
    if (args.storeSlug) console.log(`  --storeSlug = ${args.storeSlug}`);
    console.log(`  --limit = ${args.limit}`);
    console.log("");

    // ── 3. Classify (重用 dryrun 邏輯) ──
    const rows: Row[] = [];
    for (let i = 0; i < customers.length; i++) {
      process.stderr.write(`\r  classifying ${i + 1}/${customers.length}...`);
      const row = await classify(customers[i]);
      rows.push(row);
      if (i < customers.length - 1) await new Promise((r) => setTimeout(r, 50));
    }
    process.stderr.write("\n\n");

    // ── 4. Bucket counts ──
    const counts: Record<Bucket, number> = {
      AUTO_LINK_CANDIDATE: 0,
      NEEDS_REVIEW_EMAIL_ONLY: 0,
      NEEDS_REVIEW_PHONE_ONLY: 0,
      MULTIPLE_CANDIDATES: 0,
      NOT_FOUND: 0,
      API_ERROR: 0,
      SKIPPED_NO_CONTACT: 0,
      SKIPPED_INVALID_CONTACT: 0,
    };
    for (const r of rows) counts[r.bucket]++;

    console.log("=".repeat(72));
    console.log("【bucket 統計】");
    console.log("=".repeat(72));
    console.log(`  ✅ AUTO_LINK_CANDIDATE        : ${counts.AUTO_LINK_CANDIDATE}  （${args.execute ? "本次將寫入" : "DRY-RUN：會寫入"}）`);
    console.log(`  ⚠️ NEEDS_REVIEW_EMAIL_ONLY    : ${counts.NEEDS_REVIEW_EMAIL_ONLY}  （SKIPPED）`);
    console.log(`  ⚠️ NEEDS_REVIEW_PHONE_ONLY    : ${counts.NEEDS_REVIEW_PHONE_ONLY}  （SKIPPED）`);
    console.log(`  ⚠️ MULTIPLE_CANDIDATES        : ${counts.MULTIPLE_CANDIDATES}  （SKIPPED — 需店長手選）`);
    console.log(`  ➖ NOT_FOUND                  : ${counts.NOT_FOUND}  （SKIPPED）`);
    console.log(`  ❌ API_ERROR                  : ${counts.API_ERROR}  （SKIPPED）`);
    console.log(`  ➖ SKIPPED_NO_CONTACT         : ${counts.SKIPPED_NO_CONTACT}  （SKIPPED）`);
    console.log(`  ➖ SKIPPED_INVALID_CONTACT    : ${counts.SKIPPED_INVALID_CONTACT}  （SKIPPED）`);
    console.log("");

    // ── 5. max-writes safety valve（execute mode）──
    const candidates = rows.filter((r) => r.bucket === "AUTO_LINK_CANDIDATE");
    if (args.execute && args.maxWrites !== null && candidates.length > args.maxWrites) {
      console.error("=".repeat(72));
      console.error(`⛔  REFUSED — AUTO_LINK_CANDIDATE (${candidates.length}) 超過 --max-writes (${args.maxWrites})`);
      console.error("=".repeat(72));
      console.error("");
      console.error("整批不寫入。如要繼續，請：");
      console.error(`  1. 確認候選名單合理（先用 dry-run 看明細）`);
      console.error(`  2. 重新執行並提高 --max-writes 上限到至少 ${candidates.length}`);
      console.error("");
      process.exit(1);
    }

    // ── 6. Process candidates ──
    const outcomes: WriteOutcome[] = [];
    for (const r of candidates) {
      if (!r.matchedProfileId) {
        // 不該發生（AUTO_LINK_CANDIDATE 一定有 profileId），保險
        continue;
      }
      // dry-run mode
      if (!args.execute) {
        outcomes.push({
          customerId: r.customerId,
          customerName: r.customerName,
          storeSlug: r.storeSlug,
          profileId: r.matchedProfileId,
          beforeStatus: r.currentLinkStatus,
          result: "WOULD_WRITE",
        });
        continue;
      }

      // execute mode — CAS write
      // updateMany WHERE: id + healthProfileId IS NULL + healthLinkStatus IN allowed
      // count=0 視為 CAS_LOST，繼續處理下一筆，不 throw
      const result = await prisma.customer.updateMany({
        where: {
          id: r.customerId,
          healthProfileId: null,
          healthLinkStatus: { in: ["unlinked", "not_found", "error"] },
        },
        data: {
          healthProfileId: r.matchedProfileId,
          healthLinkStatus: "linked",
          healthSyncedAt: new Date(),
        },
      });
      outcomes.push({
        customerId: r.customerId,
        customerName: r.customerName,
        storeSlug: r.storeSlug,
        profileId: r.matchedProfileId,
        beforeStatus: r.currentLinkStatus,
        result: result.count === 1 ? "WRITTEN" : "CAS_LOST",
      });
    }

    // ── 7. Output outcomes ──
    console.log("=".repeat(72));
    console.log(args.execute ? "【寫入結果】" : "【WOULD-WRITE 預覽】");
    console.log("=".repeat(72));
    if (outcomes.length === 0) {
      console.log("  (無 AUTO_LINK_CANDIDATE，無寫入)");
    } else {
      for (const o of outcomes) {
        const tag =
          o.result === "WRITTEN"
            ? "✅ WRITTEN"
            : o.result === "CAS_LOST"
              ? "⚠️ CAS_LOST"
              : "🔍 WOULD_WRITE";
        console.log(`  ${tag} | ${o.customerName} @ ${o.storeSlug}`);
        console.log(`    customerId   = ${o.customerId}`);
        console.log(`    beforeStatus = ${o.beforeStatus}`);
        console.log(`    profileId    = ${o.profileId}`);
        console.log(`    afterStatus  = ${o.result === "WRITTEN" ? "linked" : o.result === "CAS_LOST" ? "(unchanged, race-lost)" : "(linked, dry-run)"}`);
      }
    }
    console.log("");

    // ── 8. Summary ──
    const writeOk = outcomes.filter((o) => o.result === "WRITTEN").length;
    const casLost = outcomes.filter((o) => o.result === "CAS_LOST").length;
    const wouldWrite = outcomes.filter((o) => o.result === "WOULD_WRITE").length;
    console.log("=".repeat(72));
    console.log(args.execute ? "【EXECUTE 摘要】" : "【DRY-RUN 摘要】");
    console.log("=".repeat(72));
    if (args.execute) {
      console.log(`  ✅ WRITTEN   : ${writeOk}`);
      console.log(`  ⚠️ CAS_LOST  : ${casLost}  ${casLost > 0 ? "（並行寫入或 healthLinkStatus 已變化，已 skip）" : ""}`);
      console.log("");
      console.log("  再跑一次 --execute 應該得 0 WRITTEN（idempotent）。");
    } else {
      console.log(`  🔍 WOULD_WRITE : ${wouldWrite}`);
      console.log("");
      console.log("  授權後實寫請帶：");
      console.log(`    --execute --max-writes ${Math.max(wouldWrite, 1)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Entrypoint gate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("[healthflow-link-execute] failed:", e);
    process.exit(1);
  });
}
