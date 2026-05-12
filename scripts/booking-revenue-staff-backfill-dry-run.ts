/**
 * booking-revenue-staff-backfill-dry-run.ts — DRY RUN ONLY（讀，不寫）
 *
 * 用途：PR-1.5b。列出所有 `bookingStatus=COMPLETED AND revenueStaffId IS NULL`
 * 的 booking，逐筆顯示「若要回填，應回填給誰」（依目前 customer.assignedStaffId）。
 * 由 operator review 後，才決定是否開獨立 PR 跑「真實 backfill」。
 *
 * **絕對只讀**。沒有 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 * 只用 Prisma findMany / count。
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §3.4.1（PR-1.5a 鎖定的快照規則）
 * 與 §8.3（PR-1.5 audit 結論：23 筆 backfill candidates）
 *
 * Usage:
 *   # 預設：過去 6 個月（與 PR-1.5 audit 範圍對齊）
 *   npx tsx scripts/booking-revenue-staff-backfill-dry-run.ts
 *
 *   # 自訂範圍
 *   npx tsx scripts/booking-revenue-staff-backfill-dry-run.ts --from 2025-01-01 --to 2026-05-12
 *
 *   # 顯示「所有歷史」（不限日期）
 *   npx tsx scripts/booking-revenue-staff-backfill-dry-run.ts --all
 *
 *   # 指定單店
 *   npx tsx scripts/booking-revenue-staff-backfill-dry-run.ts --store <storeId>
 *
 *   # CSV 輸出
 *   npx tsx scripts/booking-revenue-staff-backfill-dry-run.ts --csv > backfill-dry-run.csv
 */

import { PrismaClient } from "@prisma/client";

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

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

// ── 分類 ──────────────────────────────────────────────────────────────────

type ActionKind =
  | "WILL_BACKFILL"
  | "WILL_SKIP_HOMELESS"
  | "FLAG_REVIEW_STALE_INACTIVE"
  | "FLAG_REVIEW_STALE_CROSS_STORE";

interface AnalysisRow {
  bookingId: string;
  bookingDate: Date;
  slotTime: string;
  bookingType: string;
  isMakeup: boolean;
  storeId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  proposedStaffId: string | null;
  proposedStaffName: string;
  proposedStaffStatus: string; // "ACTIVE" / "INACTIVE" / "—" / "DIFFERENT_STORE"
  action: ActionKind;
  note: string;
}

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const wantAll = process.argv.includes("--all");
  const storeId = parseFlagValue("--store");

  // 範圍：預設 6 個月（與 PR-1.5 audit 對齊）；--all 移除範圍限制
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const fromArg = parseFlagValue("--from");
  const toArg = parseFlagValue("--to");
  const from = wantAll ? null : parseDateOrDefault(fromArg, sixMonthsAgo);
  const to = wantAll ? null : parseDateOrDefault(toArg, now);

  const storeFilter = storeId ? { storeId } : {};
  const dateFilter =
    from && to ? { bookingDate: { gte: from, lte: to } } : {};

  if (!wantCsv) {
    console.error(
      `[booking-revenue-staff-backfill-dry-run] ` +
        `from=${fmtDate(from)} to=${fmtDate(to)} ` +
        `store=${storeId ?? "ALL"} mode=DRY_RUN`,
    );
  }

  // ── 找出所有 candidates ──────────────────────────────────────────────
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
      bookingType: true,
      isMakeup: true,
      storeId: true,
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

  // ── 逐筆分類 ────────────────────────────────────────────────────────
  const rows: AnalysisRow[] = candidates.map((b) => {
    const c = b.customer;
    const staff = c.assignedStaff;

    let action: ActionKind;
    let proposedStaffStatus: string;
    let proposedStaffName: string;
    let note = "";

    if (!c.assignedStaffId || !staff) {
      action = "WILL_SKIP_HOMELESS";
      proposedStaffStatus = "—";
      proposedStaffName = "—";
      note = "顧客無 assignedStaffId → revenueStaffId 維持 null（歸店家）";
    } else if (staff.storeId !== b.storeId) {
      action = "FLAG_REVIEW_STALE_CROSS_STORE";
      proposedStaffStatus = "DIFFERENT_STORE";
      proposedStaffName = staff.displayName;
      note = `staff.storeId=${staff.storeId} ≠ booking.storeId=${b.storeId}，需 operator 確認`;
    } else if (staff.status !== "ACTIVE") {
      action = "FLAG_REVIEW_STALE_INACTIVE";
      proposedStaffStatus = staff.status;
      proposedStaffName = staff.displayName;
      note = `staff.status=${staff.status}，已停用，需 operator 確認是否仍可作為歷史歸屬`;
    } else {
      action = "WILL_BACKFILL";
      proposedStaffStatus = "ACTIVE";
      proposedStaffName = staff.displayName;
      note = "可乾淨回填";
    }

    return {
      bookingId: b.id,
      bookingDate: b.bookingDate,
      slotTime: b.slotTime,
      bookingType: b.bookingType,
      isMakeup: b.isMakeup,
      storeId: b.storeId,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone ?? "",
      proposedStaffId: c.assignedStaffId,
      proposedStaffName,
      proposedStaffStatus,
      action,
      note,
    };
  });

  // ── Summary ─────────────────────────────────────────────────────────
  const summary: Record<ActionKind, number> = {
    WILL_BACKFILL: 0,
    WILL_SKIP_HOMELESS: 0,
    FLAG_REVIEW_STALE_INACTIVE: 0,
    FLAG_REVIEW_STALE_CROSS_STORE: 0,
  };
  for (const r of rows) summary[r.action]++;

  // Per-proposed-staff distribution（只看 WILL_BACKFILL）
  const perStaffMap = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (r.action === "WILL_BACKFILL" && r.proposedStaffId) {
      const existing = perStaffMap.get(r.proposedStaffId);
      if (existing) existing.count++;
      else
        perStaffMap.set(r.proposedStaffId, {
          name: r.proposedStaffName,
          count: 1,
        });
    }
  }

  // ── Output ──────────────────────────────────────────────────────────
  if (wantCsv) {
    const HEADERS = [
      "bookingId",
      "bookingDate",
      "slotTime",
      "bookingType",
      "isMakeup",
      "storeId",
      "customerId",
      "customerName",
      "customerPhone",
      "proposedStaffId",
      "proposedStaffName",
      "proposedStaffStatus",
      "action",
      "note",
    ];
    process.stdout.write(HEADERS.join(",") + "\n");
    for (const r of rows) {
      process.stdout.write(
        [
          r.bookingId,
          fmtDate(r.bookingDate),
          r.slotTime,
          r.bookingType,
          r.isMakeup,
          r.storeId,
          r.customerId,
          r.customerName,
          r.customerPhone,
          r.proposedStaffId ?? "",
          r.proposedStaffName,
          r.proposedStaffStatus,
          r.action,
          r.note,
        ]
          .map(csvField)
          .join(",") +
          "\n",
      );
    }
    return;
  }

  // 人類可讀模式
  console.log("\n=== Booking Revenue-Staff Backfill — DRY RUN (READ-ONLY) ===\n");
  console.log(
    `Filter: from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"}`,
  );
  console.log(
    `Candidates: ${rows.length} bookings with bookingStatus=COMPLETED AND revenueStaffId IS NULL\n`,
  );

  if (rows.length === 0) {
    console.log(
      "✓ 沒有 candidates。可能因為 (a) PR-1.5a 已上線，新建 booking 都有快照；",
    );
    console.log(
      "  (b) 此範圍內沒有 COMPLETED booking；或 (c) 都已被回填過。",
    );
    return;
  }

  // 明細表
  console.log("=== Per-booking analysis ===");
  console.table(
    rows.map((r) => ({
      bookingId: r.bookingId.slice(-8),
      date: fmtDate(r.bookingDate),
      slot: r.slotTime,
      type: r.bookingType,
      makeup: r.isMakeup ? "Y" : "",
      customer: r.customerName,
      proposedStaff: r.proposedStaffName,
      staffStatus: r.proposedStaffStatus,
      action: r.action,
    })),
  );

  // Summary
  console.log("\n=== Summary ===");
  const total = rows.length;
  console.table([
    {
      action: "WILL_BACKFILL",
      count: summary.WILL_BACKFILL,
      pct: `${((summary.WILL_BACKFILL / total) * 100).toFixed(1)}%`,
      meaning: "可乾淨回填（staff ACTIVE 且同店）",
    },
    {
      action: "WILL_SKIP_HOMELESS",
      count: summary.WILL_SKIP_HOMELESS,
      pct: `${((summary.WILL_SKIP_HOMELESS / total) * 100).toFixed(1)}%`,
      meaning: "顧客無 assignedStaffId → 維持 null（歸店家）",
    },
    {
      action: "FLAG_REVIEW_STALE_INACTIVE",
      count: summary.FLAG_REVIEW_STALE_INACTIVE,
      pct: `${((summary.FLAG_REVIEW_STALE_INACTIVE / total) * 100).toFixed(1)}%`,
      meaning: "staff 已停用 → 需 operator 決定",
    },
    {
      action: "FLAG_REVIEW_STALE_CROSS_STORE",
      count: summary.FLAG_REVIEW_STALE_CROSS_STORE,
      pct: `${((summary.FLAG_REVIEW_STALE_CROSS_STORE / total) * 100).toFixed(1)}%`,
      meaning: "staff 不同店 → 需 operator 決定",
    },
  ]);

  // Per-staff distribution
  if (perStaffMap.size > 0) {
    console.log("\n=== Per-proposed-staff backfill distribution (WILL_BACKFILL only) ===");
    console.table(
      [...perStaffMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, v]) => ({
          staffId: id.slice(-8),
          displayName: v.name,
          bookings: v.count,
          pct: `${((v.count / total) * 100).toFixed(1)}%`,
        })),
    );
  }

  // Next-step guidance
  const flagCount =
    summary.FLAG_REVIEW_STALE_INACTIVE + summary.FLAG_REVIEW_STALE_CROSS_STORE;

  console.log("\n=== Next step ===");
  if (flagCount === 0) {
    console.log(
      "✓ 沒有需 review 的 candidate。可安全進入真實 backfill 階段。",
    );
    console.log(
      "  注意：真實 backfill 必須開獨立 PR（PR-1.5c），含 rollback 計畫、",
    );
    console.log(
      "  且 operator approve 後才執行，**不要**直接從這支 dry-run 改成寫入。",
    );
  } else {
    console.log(
      `⚠ 有 ${flagCount} 筆需 operator 確認（INACTIVE 或跨店 staff）。`,
    );
    console.log(
      "  請先決定這些異常 booking 怎麼處理（保留 null？指派給其他 staff？）",
    );
    console.log("  再進真實 backfill。");
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
