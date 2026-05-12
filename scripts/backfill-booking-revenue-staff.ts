/**
 * backfill-booking-revenue-staff.ts — Booking.revenueStaffId 真實 backfill（PR-1.5c）
 *
 * Default 行為：DRY RUN（不寫入），明確加 --apply 才會 UPDATE。
 *
 * 安全條件（所有都必須滿足才會被列入更新）：
 *   - bookingStatus = COMPLETED
 *   - revenueStaffId IS NULL
 *   - customer.assignedStaffId 有值
 *   - customer.assignedStaff.status = ACTIVE
 *   - customer.assignedStaff.storeId = booking.storeId（同店）
 *
 * 任何 candidate 落入下列情況都會讓整個 batch **中止**（不會部分執行）：
 *   - staff 已停用（FLAG_REVIEW_STALE_INACTIVE）
 *   - staff 不同店（FLAG_REVIEW_STALE_CROSS_STORE）
 *   - 顧客無 assignedStaffId（WILL_SKIP_HOMELESS）— 不阻斷，但會被排除在更新外
 *   - --apply 但未提供 --expected-count
 *   - --expected-count 與實際 candidate 數不符
 *
 * 寫入策略：
 *   - 用 prisma.$transaction([...updateMany])，整批 atomic
 *   - 每筆 updateMany 的 where 都加 revenueStaffId=null + bookingStatus=COMPLETED
 *     做 race-safe 雙保險（兩個 dry-run 之間如有人改了，那筆會 skip）
 *   - 只 update Booking.revenueStaffId 一個欄位，**不**碰 Transaction / Wallet /
 *     Customer / WalletSession / Settlement / schema
 *
 * 後續可用 scripts/rollback-booking-revenue-staff-backfill.ts 回退。
 *
 * Usage:
 *   # 1. DRY RUN（預設）— 不會寫入
 *   npx tsx scripts/backfill-booking-revenue-staff.ts
 *
 *   # 2. 範圍 / 店家篩選（與 dry-run script 對齊）
 *   npx tsx scripts/backfill-booking-revenue-staff.ts --from 2025-11-13 --to 2026-05-12
 *
 *   # 3. 真實 backfill（需 --expected-count 防呆）
 *   npx tsx scripts/backfill-booking-revenue-staff.ts --apply --expected-count 25
 *
 *   # 4. CSV 模式（含 rollback ids 方便 archive）
 *   npx tsx scripts/backfill-booking-revenue-staff.ts --apply --expected-count 25 --csv > apply.csv
 */

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

function parseDateOrDefault(s: string | null, fallback: Date | null): Date | null {
  if (!s) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    console.error(`ERROR: 日期格式需為 YYYY-MM-DD，收到 "${s}"`);
    process.exit(1);
  }
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    console.error(`ERROR: 無法解析日期 "${s}"`);
    process.exit(1);
  }
  return d;
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function abort(reason: string): never {
  console.error(`\n🔴 ABORT: ${reason}\n`);
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const wantApply = process.argv.includes("--apply");
  const wantCsv = process.argv.includes("--csv");
  const wantAll = process.argv.includes("--all");
  const storeId = parseFlagValue("--store");
  const expectedCountStr = parseFlagValue("--expected-count");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const fromArg = parseFlagValue("--from");
  const toArg = parseFlagValue("--to");
  const from = wantAll ? null : parseDateOrDefault(fromArg, sixMonthsAgo);
  const to = wantAll ? null : parseDateOrDefault(toArg, now);

  // --apply 必須伴隨 --expected-count
  if (wantApply && !expectedCountStr) {
    abort(
      "--apply 必須伴隨 --expected-count <N>（防呆：先跑 dry-run 確認 N 後才加上 --apply）",
    );
  }
  const expectedCount =
    expectedCountStr !== null ? Number(expectedCountStr) : null;
  if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
    abort(`--expected-count 必須是非負整數，收到 "${expectedCountStr}"`);
  }

  const storeFilter = storeId ? { storeId } : {};
  const dateFilter = from && to ? { bookingDate: { gte: from, lte: to } } : {};

  if (!wantCsv) {
    console.error(
      `[backfill-booking-revenue-staff] mode=${wantApply ? "APPLY" : "DRY_RUN"} ` +
        `from=${fmtDate(from)} to=${fmtDate(to)} ` +
        `store=${storeId ?? "ALL"} ` +
        `expected-count=${expectedCount ?? "(not set)"}`,
    );
  }

  // ── Fetch 所有 candidates（同 dry-run script 的篩選）─────────────────
  const candidates = await prisma.booking.findMany({
    where: {
      ...storeFilter,
      ...dateFilter,
      bookingStatus: "COMPLETED",
      revenueStaffId: null,
    },
    select: {
      id: true,
      bookingDate: true,
      slotTime: true,
      storeId: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedStaffId: true,
          assignedStaff: {
            select: { id: true, displayName: true, storeId: true, status: true },
          },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });

  // ── 分類：only WILL_BACKFILL 進更新清單 ──────────────────────────────
  type Action =
    | "WILL_BACKFILL"
    | "WILL_SKIP_HOMELESS"
    | "FLAG_REVIEW_STALE_INACTIVE"
    | "FLAG_REVIEW_STALE_CROSS_STORE";

  interface Row {
    bookingId: string;
    bookingDate: Date;
    customerName: string;
    proposedStaffId: string | null;
    proposedStaffName: string;
    action: Action;
  }

  const rows: Row[] = candidates.map((b) => {
    const c = b.customer;
    const staff = c.assignedStaff;
    if (!c.assignedStaffId || !staff) {
      return {
        bookingId: b.id,
        bookingDate: b.bookingDate,
        customerName: c.name,
        proposedStaffId: null,
        proposedStaffName: "—",
        action: "WILL_SKIP_HOMELESS",
      };
    }
    if (staff.storeId !== b.storeId) {
      return {
        bookingId: b.id,
        bookingDate: b.bookingDate,
        customerName: c.name,
        proposedStaffId: c.assignedStaffId,
        proposedStaffName: staff.displayName,
        action: "FLAG_REVIEW_STALE_CROSS_STORE",
      };
    }
    if (staff.status !== "ACTIVE") {
      return {
        bookingId: b.id,
        bookingDate: b.bookingDate,
        customerName: c.name,
        proposedStaffId: c.assignedStaffId,
        proposedStaffName: staff.displayName,
        action: "FLAG_REVIEW_STALE_INACTIVE",
      };
    }
    return {
      bookingId: b.id,
      bookingDate: b.bookingDate,
      customerName: c.name,
      proposedStaffId: c.assignedStaffId,
      proposedStaffName: staff.displayName,
      action: "WILL_BACKFILL",
    };
  });

  const willBackfill = rows.filter((r) => r.action === "WILL_BACKFILL");
  const flagged = rows.filter(
    (r) =>
      r.action === "FLAG_REVIEW_STALE_INACTIVE" ||
      r.action === "FLAG_REVIEW_STALE_CROSS_STORE",
  );
  const skipped = rows.filter((r) => r.action === "WILL_SKIP_HOMELESS");

  // ── Pre-flight 防呆 ──────────────────────────────────────────────────
  if (flagged.length > 0) {
    console.error(
      `\n🔴 偵測到 ${flagged.length} 筆 flagged candidate（stale staff / cross-store）：`,
    );
    for (const f of flagged) {
      console.error(`  - ${f.bookingId} (${f.customerName}): ${f.action}`);
    }
    abort(
      "請先到顧客 drawer 修正這些顧客的直屬店長指派，再重跑此 script。",
    );
  }

  if (expectedCount !== null && willBackfill.length !== expectedCount) {
    abort(
      `WILL_BACKFILL 實際 ${willBackfill.length} 筆，與 --expected-count=${expectedCount} 不符。` +
        `請先用 scripts/booking-revenue-staff-backfill-dry-run.ts 確認最新數字。`,
    );
  }

  if (willBackfill.length === 0) {
    console.log("\n✓ 沒有可回填的 candidate（可能已 backfilled 過或無符合條件 booking）。");
    return;
  }

  // ── 顯示計畫 ────────────────────────────────────────────────────────
  if (wantCsv) {
    process.stdout.write("bookingId,bookingDate,customerName,proposedStaffId,proposedStaffName,action\n");
    for (const r of rows) {
      process.stdout.write(
        [
          r.bookingId,
          fmtDate(r.bookingDate),
          r.customerName,
          r.proposedStaffId ?? "",
          r.proposedStaffName,
          r.action,
        ]
          .map(csvField)
          .join(",") +
          "\n",
      );
    }
  } else {
    console.log("\n=== Backfill plan ===");
    console.log(
      `  WILL_BACKFILL      : ${willBackfill.length}`,
    );
    console.log(`  WILL_SKIP_HOMELESS : ${skipped.length}（不更新，維持 null）`);
    console.log(`  flagged            : 0`);

    // Per-staff distribution
    const perStaff = new Map<string, { name: string; count: number }>();
    for (const r of willBackfill) {
      if (!r.proposedStaffId) continue;
      const e = perStaff.get(r.proposedStaffId);
      if (e) e.count++;
      else perStaff.set(r.proposedStaffId, { name: r.proposedStaffName, count: 1 });
    }
    console.log("\n=== Per-proposed-staff backfill distribution ===");
    console.table(
      [...perStaff.entries()].map(([id, v]) => ({
        staffId: id.slice(-8),
        displayName: v.name,
        bookings: v.count,
      })),
    );

    // Detail（前 50 筆，避免螢幕被洗）
    console.log(`\n=== Per-booking plan (showing first 50 of ${willBackfill.length}) ===`);
    console.table(
      willBackfill.slice(0, 50).map((r) => ({
        bookingId: r.bookingId.slice(-8),
        date: fmtDate(r.bookingDate),
        customer: r.customerName,
        oldStaff: "(null)",
        newStaff: r.proposedStaffName,
      })),
    );
  }

  // ── DRY RUN：到此結束 ────────────────────────────────────────────────
  if (!wantApply) {
    console.log("\n=== DRY_RUN: 沒有寫入。確認以上計畫正確後，加 --apply --expected-count <N> 才會真實寫入。 ===\n");
    return;
  }

  // ── APPLY 寫入 ──────────────────────────────────────────────────────
  console.log("\n=== APPLYING BACKFILL（writes will happen now）===");

  // 用 $transaction 整批 atomic。每筆 updateMany 帶嚴格 where：
  //   - id 比對
  //   - revenueStaffId still null（race-safe：被別人改過就 skip）
  //   - bookingStatus still COMPLETED
  //   - storeId match
  //   - customer.assignedStaffId still == proposed（顧客指派若被改過就 skip）
  const updateOps = willBackfill.map((r) =>
    prisma.booking.updateMany({
      where: {
        id: r.bookingId,
        bookingStatus: "COMPLETED",
        revenueStaffId: null,
        storeId: candidates.find((c) => c.id === r.bookingId)?.storeId,
        customer: {
          is: { assignedStaffId: r.proposedStaffId },
        },
      },
      data: { revenueStaffId: r.proposedStaffId },
    }),
  );

  const results = await prisma.$transaction(updateOps);

  // 統計：每筆 updateMany 的 count 應該是 1；若是 0 表示 race condition 跳過
  let updated = 0;
  let raceSkipped = 0;
  const updatedIds: string[] = [];
  const skippedIds: string[] = [];
  results.forEach((r, i) => {
    if (r.count === 1) {
      updated++;
      updatedIds.push(willBackfill[i].bookingId);
    } else {
      raceSkipped++;
      skippedIds.push(willBackfill[i].bookingId);
    }
  });

  console.log("\n=== Apply result ===");
  console.log(`  updated      : ${updated}`);
  console.log(`  race-skipped : ${raceSkipped}（被他人改過，自動跳過）`);
  console.log(`  total in tx  : ${results.length}`);

  if (raceSkipped > 0) {
    console.log("\n  被跳過的 booking IDs：");
    for (const id of skippedIds) console.log(`    ${id}`);
  }

  // ── Rollback instructions ───────────────────────────────────────────
  console.log("\n=== Rollback instructions ===");
  console.log("如需回退這次更新，把以下 IDs 餵給 rollback script：\n");
  console.log("  bookingIds:");
  for (const id of updatedIds) console.log(`    ${id}`);
  console.log("");
  // 假設 backfill 是針對單一 staff（PR-1.5c 的情境）
  const onlyStaffId = updatedIds.length > 0
    ? willBackfill.find((r) => updatedIds.includes(r.bookingId))?.proposedStaffId
    : null;
  if (onlyStaffId) {
    console.log("  rollback 指令範例（檢查 expected-staff 防呆）：");
    console.log(
      `    npx tsx scripts/rollback-booking-revenue-staff-backfill.ts \\`,
    );
    console.log(`      --expected-staff ${onlyStaffId} \\`);
    console.log(`      --ids ${updatedIds.slice(0, 3).join(",")},...  # 完整 IDs 如上`);
    console.log(
      "    (預設 dry-run；加 --apply 才真實回退)",
    );
  }

  console.log("");
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
