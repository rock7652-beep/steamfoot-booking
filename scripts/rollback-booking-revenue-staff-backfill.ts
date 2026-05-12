/**
 * rollback-booking-revenue-staff-backfill.ts — 回退 PR-1.5c 的 backfill
 *
 * Default 行為：DRY RUN（不寫入），明確加 --apply 才會 UPDATE。
 *
 * 雙重防呆：
 *   - --apply 必須伴隨 --expected-staff <staffId>
 *   - 只回退「目前 revenueStaffId === --expected-staff」的 booking
 *     → 若中間被 operator 手動改成其他 staff，**不**會被回退
 *   - --apply 必須伴隨 --ids 或 --ids-file
 *
 * 寫入策略：
 *   - 用 prisma.$transaction([...updateMany])，整批 atomic
 *   - 每筆 updateMany 的 where 都包含 revenueStaffId = expectedStaff 雙保險
 *   - 只 update Booking.revenueStaffId 一個欄位 → null
 *   - 不碰 Transaction / Wallet / Customer / WalletSession / Settlement / schema
 *
 * Usage:
 *   # DRY RUN（預設）— 顯示「會回退哪些」
 *   npx tsx scripts/rollback-booking-revenue-staff-backfill.ts \
 *     --expected-staff <staffId> \
 *     --ids bk_aaa,bk_bbb,bk_ccc
 *
 *   # 用檔案傳 IDs（一行一個）
 *   npx tsx scripts/rollback-booking-revenue-staff-backfill.ts \
 *     --expected-staff <staffId> \
 *     --ids-file rollback-ids.txt
 *
 *   # 真實寫入（rollback）
 *   npx tsx scripts/rollback-booking-revenue-staff-backfill.ts \
 *     --apply --expected-staff <staffId> --ids bk_aaa,bk_bbb
 */

import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ── CLI args ──────────────────────────────────────────────────────────────

function parseFlagValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const raw = process.argv[idx + 1];
  if (!raw || raw.startsWith("--")) {
    console.error(`ERROR: ${flag} 需要參數`);
    process.exit(1);
  }
  return raw;
}

function abort(reason: string): never {
  console.error(`\n🔴 ABORT: ${reason}\n`);
  process.exit(1);
}

function readIds(idsArg: string | null, idsFileArg: string | null): string[] {
  if (idsArg && idsFileArg) {
    abort("不可同時使用 --ids 與 --ids-file");
  }
  if (idsArg) {
    return idsArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (idsFileArg) {
    const content = readFileSync(idsFileArg, "utf8");
    return content
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
  }
  return [];
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const wantApply = process.argv.includes("--apply");
  const expectedStaff = parseFlagValue("--expected-staff");
  const idsArg = parseFlagValue("--ids");
  const idsFileArg = parseFlagValue("--ids-file");

  if (!expectedStaff) {
    abort("必須提供 --expected-staff <staffId>（防呆：只回退被指定 staff 標記的 booking）");
  }
  const ids = readIds(idsArg, idsFileArg);
  if (ids.length === 0) {
    abort("必須提供 --ids <id1,id2,...> 或 --ids-file <path>");
  }

  console.error(
    `[rollback-booking-revenue-staff] mode=${wantApply ? "APPLY" : "DRY_RUN"} ` +
      `expected-staff=${expectedStaff} target-count=${ids.length}`,
  );

  // ── 先 fetch 這批 booking，看實際狀態 ─────────────────────────────────
  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      bookingDate: true,
      bookingStatus: true,
      revenueStaffId: true,
      customer: { select: { name: true } },
    },
  });

  const foundIds = new Set(bookings.map((b) => b.id));
  const notFound = ids.filter((id) => !foundIds.has(id));

  type RollbackAction =
    | "WILL_ROLLBACK"
    | "SKIP_NOT_FOUND"
    | "SKIP_ALREADY_NULL"
    | "SKIP_DIFFERENT_STAFF";

  interface Row {
    bookingId: string;
    bookingDate: Date | null;
    customerName: string;
    currentRevenueStaffId: string | null;
    action: RollbackAction;
  }

  const rows: Row[] = [];
  for (const id of ids) {
    const b = bookings.find((x) => x.id === id);
    if (!b) {
      rows.push({
        bookingId: id,
        bookingDate: null,
        customerName: "(not found)",
        currentRevenueStaffId: null,
        action: "SKIP_NOT_FOUND",
      });
      continue;
    }
    if (b.revenueStaffId === null) {
      rows.push({
        bookingId: b.id,
        bookingDate: b.bookingDate,
        customerName: b.customer.name,
        currentRevenueStaffId: null,
        action: "SKIP_ALREADY_NULL",
      });
      continue;
    }
    if (b.revenueStaffId !== expectedStaff) {
      rows.push({
        bookingId: b.id,
        bookingDate: b.bookingDate,
        customerName: b.customer.name,
        currentRevenueStaffId: b.revenueStaffId,
        action: "SKIP_DIFFERENT_STAFF",
      });
      continue;
    }
    rows.push({
      bookingId: b.id,
      bookingDate: b.bookingDate,
      customerName: b.customer.name,
      currentRevenueStaffId: b.revenueStaffId,
      action: "WILL_ROLLBACK",
    });
  }

  const willRollback = rows.filter((r) => r.action === "WILL_ROLLBACK");

  console.log("\n=== Rollback plan ===");
  console.log(`  WILL_ROLLBACK          : ${willRollback.length}`);
  console.log(
    `  SKIP_NOT_FOUND         : ${rows.filter((r) => r.action === "SKIP_NOT_FOUND").length}`,
  );
  console.log(
    `  SKIP_ALREADY_NULL      : ${rows.filter((r) => r.action === "SKIP_ALREADY_NULL").length}`,
  );
  console.log(
    `  SKIP_DIFFERENT_STAFF   : ${rows.filter((r) => r.action === "SKIP_DIFFERENT_STAFF").length}`,
  );

  if (notFound.length > 0) {
    console.log("\n[Not found booking IDs]");
    for (const id of notFound) console.log(`  ${id}`);
  }

  console.log("\n=== Per-booking detail ===");
  console.table(
    rows.slice(0, 100).map((r) => ({
      bookingId: r.bookingId.slice(-8),
      date: r.bookingDate ? r.bookingDate.toISOString().slice(0, 10) : "—",
      customer: r.customerName,
      currentStaff: r.currentRevenueStaffId
        ? r.currentRevenueStaffId.slice(-8)
        : "(null)",
      action: r.action,
    })),
  );

  if (willRollback.length === 0) {
    console.log("\n✓ 沒有需要回退的 booking（可能已 rollback 過、或當前 staff 不符）。\n");
    return;
  }

  // ── DRY RUN：到此結束 ────────────────────────────────────────────────
  if (!wantApply) {
    console.log(
      "\n=== DRY_RUN: 沒有寫入。確認以上計畫正確後，加 --apply 才會真實回退。 ===\n",
    );
    return;
  }

  // ── APPLY ROLLBACK ──────────────────────────────────────────────────
  console.log("\n=== APPLYING ROLLBACK（writes will happen now）===");

  const updateOps = willRollback.map((r) =>
    prisma.booking.updateMany({
      where: {
        id: r.bookingId,
        // 雙保險：only if current still matches expected staff
        revenueStaffId: expectedStaff,
      },
      data: { revenueStaffId: null },
    }),
  );

  const results = await prisma.$transaction(updateOps);

  let reverted = 0;
  let raceSkipped = 0;
  results.forEach((r) => {
    if (r.count === 1) reverted++;
    else raceSkipped++;
  });

  console.log("\n=== Rollback result ===");
  console.log(`  reverted     : ${reverted}`);
  console.log(`  race-skipped : ${raceSkipped}`);
  console.log(`  total in tx  : ${results.length}\n`);
}

main()
  .catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("\n🔴 Prisma error:", e.code, e.message);
    } else {
      console.error("\n🔴 Fatal:", e);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
