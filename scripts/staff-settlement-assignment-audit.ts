/**
 * staff-settlement-assignment-audit.ts — 純讀取統計（無寫入）
 *
 * 用途：PR-1.5 read-only audit。在「單筆 / 批次指派直屬店長」上線之後，
 * 重新盤點顧客 assignedStaffId 與 Booking.revenueStaffId 的歸屬覆蓋率，
 * 判斷下一步應走哪條路線：
 *
 *   A) Customer.assignedStaffId 覆蓋率高 + Booking.revenueStaffId 仍多 null
 *      → future-only fix（新建 booking 寫入 revenueStaffId 快照）
 *   B) Customer.assignedStaffId 覆蓋率仍低
 *      → 先補齊顧客直屬店長
 *   C) revenueStaffId=null 但 serviceStaffId 有值
 *      → serviceStaff 只能當參考，不可直接等同 revenueStaff
 *   D) completed booking 的 customer.assignedStaffId 大多有值
 *      → 評估 backfill dry-run（必須獨立 PR）
 *
 * **不會寫入任何資料**。沒有 INSERT / UPDATE / DELETE / migration。
 *
 * Usage:
 *   # 預設：過去 6 個月、全部 store
 *   npx tsx scripts/staff-settlement-assignment-audit.ts
 *
 *   # 自訂區間（YYYY-MM-DD）
 *   npx tsx scripts/staff-settlement-assignment-audit.ts --from 2025-11-13 --to 2026-05-12
 *
 *   # 指定單一 store
 *   npx tsx scripts/staff-settlement-assignment-audit.ts --store <storeId>
 *
 *   # 輸出 CSV
 *   npx tsx scripts/staff-settlement-assignment-audit.ts --csv > audit.csv
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §8.2（重大決策點）
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

function parseDateOrDefault(s: string | null, fallback: Date): Date {
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

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ── Output rows ───────────────────────────────────────────────────────────

interface Row {
  key: string;
  value: string | number;
  note?: string;
}

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const storeId = parseFlagValue("--store");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const from = parseDateOrDefault(parseFlagValue("--from"), sixMonthsAgo);
  const to = parseDateOrDefault(parseFlagValue("--to"), now);

  const storeFilter = storeId ? { storeId } : {};
  const bookingDateRange = { gte: from, lte: to };

  if (!wantCsv) {
    console.error(
      `[staff-settlement-assignment-audit] from=${from.toISOString().slice(0, 10)} ` +
        `to=${to.toISOString().slice(0, 10)} ` +
        `store=${storeId ?? "ALL"}`,
    );
  }

  // ── Fetch 3 batches in parallel ──────────────────────────────────────
  const [customers, bookings, allStaff] = await Promise.all([
    prisma.customer.findMany({
      where: storeFilter,
      select: {
        id: true,
        storeId: true,
        assignedStaffId: true,
        assignedStaff: {
          select: { id: true, storeId: true, displayName: true },
        },
      },
    }),
    prisma.booking.findMany({
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateRange,
      },
      select: {
        id: true,
        storeId: true,
        revenueStaffId: true,
        serviceStaffId: true,
        customerId: true,
        customer: {
          select: { id: true, storeId: true, assignedStaffId: true },
        },
        revenueStaff: { select: { id: true, storeId: true } },
      },
    }),
    prisma.staff.findMany({
      where: storeFilter,
      select: { id: true, displayName: true, storeId: true, status: true },
    }),
  ]);

  const staffNameMap = new Map(allStaff.map((s) => [s.id, s.displayName]));

  // ── (1) 全顧客 assignedStaffId 覆蓋率 ────────────────────────────────
  const totalCustomers = customers.length;
  const customersAssigned = customers.filter((c) => c.assignedStaffId !== null).length;
  const customersUnassigned = totalCustomers - customersAssigned;

  // ── (2) 過去 X 個月有 completed booking 的顧客 ────────────────────────
  const customersWithBookingsSet = new Set(bookings.map((b) => b.customerId));
  const customersWithBookings = customers.filter((c) =>
    customersWithBookingsSet.has(c.id),
  );
  const cwbTotal = customersWithBookings.length;
  const cwbAssigned = customersWithBookings.filter(
    (c) => c.assignedStaffId !== null,
  ).length;
  const cwbUnassigned = cwbTotal - cwbAssigned;

  // ── (3,4) COMPLETED bookings: revenue/service staff 覆蓋率 ────────────
  const totalCompleted = bookings.length;
  const bWithRevenue = bookings.filter((b) => b.revenueStaffId !== null).length;
  const bNullRevenue = totalCompleted - bWithRevenue;
  const bWithService = bookings.filter((b) => b.serviceStaffId !== null).length;
  const bNullService = totalCompleted - bWithService;

  // ── (5,6,7) 交叉分析 ────────────────────────────────────────────────
  const nullRev_customerAssigned = bookings.filter(
    (b) => b.revenueStaffId === null && b.customer.assignedStaffId !== null,
  ).length;
  const nullRev_customerUnassigned = bookings.filter(
    (b) => b.revenueStaffId === null && b.customer.assignedStaffId === null,
  ).length;
  const nullRev_hasService = bookings.filter(
    (b) => b.revenueStaffId === null && b.serviceStaffId !== null,
  ).length;

  // ── (8) groupBy customer.assignedStaffId → completed booking 數 ──────
  const groupByAssigned = new Map<string | null, number>();
  for (const b of bookings) {
    const key = b.customer.assignedStaffId;
    groupByAssigned.set(key, (groupByAssigned.get(key) ?? 0) + 1);
  }

  // ── (9) groupBy serviceStaffId → completed booking 數 ────────────────
  const groupByService = new Map<string | null, number>();
  for (const b of bookings) {
    const key = b.serviceStaffId;
    groupByService.set(key, (groupByService.get(key) ?? 0) + 1);
  }

  // ── (10) 跨店異常 ─────────────────────────────────────────────────────
  const anomalyBookingCustomerStore = bookings.filter(
    (b) => b.customer.storeId !== b.storeId,
  ).length;
  const anomalyRevenueStaffStore = bookings.filter(
    (b) => b.revenueStaff && b.revenueStaff.storeId !== b.storeId,
  ).length;
  const anomalyAssignedStaffStore = customers.filter(
    (c) => c.assignedStaff && c.assignedStaff.storeId !== c.storeId,
  ).length;

  // ── 衍生指標供 next-step guidance 用 ──────────────────────────────────
  const customerAssignedPct = totalCustomers
    ? (customersAssigned / totalCustomers) * 100
    : 0;
  const cwbAssignedPct = cwbTotal ? (cwbAssigned / cwbTotal) * 100 : 0;
  const bookingRevenuePct = totalCompleted
    ? (bWithRevenue / totalCompleted) * 100
    : 0;

  // ── Render rows ──────────────────────────────────────────────────────
  const rows: Row[] = [
    { key: "區間 from", value: from.toISOString().slice(0, 10) },
    { key: "區間 to", value: to.toISOString().slice(0, 10) },
    { key: "store 範圍", value: storeId ?? "ALL" },

    { key: "─── 全顧客 assignedStaffId 覆蓋率 ───", value: "" },
    { key: "顧客總數", value: totalCustomers },
    {
      key: "  ├─ 有 assignedStaffId",
      value: customersAssigned,
      note: pct(customersAssigned, totalCustomers),
    },
    {
      key: "  └─ 無 assignedStaffId",
      value: customersUnassigned,
      note: pct(customersUnassigned, totalCustomers),
    },

    { key: "─── 區間內有 COMPLETED booking 的顧客 ───", value: "" },
    { key: "顧客數", value: cwbTotal },
    {
      key: "  ├─ 有 assignedStaffId",
      value: cwbAssigned,
      note: pct(cwbAssigned, cwbTotal),
    },
    {
      key: "  └─ 無 assignedStaffId",
      value: cwbUnassigned,
      note: pct(cwbUnassigned, cwbTotal),
    },

    { key: "─── COMPLETED bookings ───", value: "" },
    { key: "bookings 總數", value: totalCompleted },
    {
      key: "  Booking.revenueStaffId 有值",
      value: bWithRevenue,
      note: pct(bWithRevenue, totalCompleted),
    },
    {
      key: "  Booking.revenueStaffId 為 null",
      value: bNullRevenue,
      note: pct(bNullRevenue, totalCompleted),
    },
    {
      key: "  Booking.serviceStaffId 有值",
      value: bWithService,
      note: pct(bWithService, totalCompleted),
    },
    {
      key: "  Booking.serviceStaffId 為 null",
      value: bNullService,
      note: pct(bNullService, totalCompleted),
    },

    { key: "─── 交叉分析（聚焦 revenueStaffId=null）───", value: "" },
    {
      key: "  revenueStaffId=null AND customer.assignedStaffId!=null  (← backfill candidates)",
      value: nullRev_customerAssigned,
      note: pct(nullRev_customerAssigned, totalCompleted),
    },
    {
      key: "  revenueStaffId=null AND customer.assignedStaffId=null  (← 真的歸店家)",
      value: nullRev_customerUnassigned,
      note: pct(nullRev_customerUnassigned, totalCompleted),
    },
    {
      key: "  revenueStaffId=null AND serviceStaffId!=null  (← serviceStaff 僅參考)",
      value: nullRev_hasService,
      note: pct(nullRev_hasService, totalCompleted),
    },

    { key: "─── 跨店異常 ───", value: "" },
    {
      key: "  booking.storeId != customer.storeId",
      value: anomalyBookingCustomerStore,
      note: anomalyBookingCustomerStore > 0 ? "⚠ 需調查" : "✓",
    },
    {
      key: "  booking.revenueStaffId 對應 staff 不同店",
      value: anomalyRevenueStaffStore,
      note: anomalyRevenueStaffStore > 0 ? "⚠ 需調查" : "✓",
    },
    {
      key: "  customer.assignedStaffId 對應 staff 不同店",
      value: anomalyAssignedStaffStore,
      note: anomalyAssignedStaffStore > 0 ? "⚠ 需調查" : "✓",
    },
  ];

  // ── Output ────────────────────────────────────────────────────────────
  if (wantCsv) {
    process.stdout.write("section,key,value,note\n");
    for (const r of rows) {
      process.stdout.write(
        `${csvField(r.key)},${csvField(r.value)},${csvField(r.note ?? "")}\n`,
      );
    }
    // groupBy 區段
    process.stdout.write("\n[groupBy] customer.assignedStaffId → completed booking count\n");
    process.stdout.write("staffId,staffName,count\n");
    for (const [id, count] of [...groupByAssigned.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      const name = id ? staffNameMap.get(id) ?? "(離店?)" : "(unassigned)";
      process.stdout.write(`${csvField(id ?? "(unassigned)")},${csvField(name)},${count}\n`);
    }
    process.stdout.write("\n[groupBy] serviceStaffId → completed booking count\n");
    process.stdout.write("staffId,staffName,count\n");
    for (const [id, count] of [...groupByService.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      const name = id ? staffNameMap.get(id) ?? "(離店?)" : "(unassigned)";
      process.stdout.write(`${csvField(id ?? "(unassigned)")},${csvField(name)},${count}\n`);
    }
    return;
  }

  // 人類可讀模式
  console.log("\n=== Staff Settlement Assignment Audit (READ-ONLY) ===\n");
  console.table(
    rows.map((r) => ({
      項目: r.key,
      值: r.value,
      備註: r.note ?? "",
    })),
  );

  console.log("\n=== groupBy customer.assignedStaffId → completed booking 數 ===");
  const assignedRows = [...groupByAssigned.entries()].sort((a, b) => b[1] - a[1]);
  if (assignedRows.length === 0) {
    console.log("(無資料)");
  } else {
    console.table(
      assignedRows.map(([id, count]) => ({
        assignedStaffId: id ?? "(unassigned)",
        staffName: id ? staffNameMap.get(id) ?? "(離店?)" : "—",
        bookings: count,
        "%": pct(count, totalCompleted),
      })),
    );
  }

  console.log("\n=== groupBy serviceStaffId → completed booking 數 ===");
  const serviceRows = [...groupByService.entries()].sort((a, b) => b[1] - a[1]);
  if (serviceRows.length === 0) {
    console.log("(無資料)");
  } else {
    console.table(
      serviceRows.map(([id, count]) => ({
        serviceStaffId: id ?? "(unassigned)",
        staffName: id ? staffNameMap.get(id) ?? "(離店?)" : "—",
        bookings: count,
        "%": pct(count, totalCompleted),
      })),
    );
  }

  // ── Next-step guidance ────────────────────────────────────────────────
  console.log("\n=== Next-step guidance ===");

  const HIGH_COVERAGE = 80; // 視為「覆蓋率高」的閾值

  // 顧客 assignedStaffId 覆蓋率（聚焦「區間內有 booking 的顧客」）
  if (cwbTotal === 0) {
    console.log("ℹ 區間內沒有 COMPLETED booking，無法做決策性判讀。");
  } else {
    if (cwbAssignedPct >= HIGH_COVERAGE) {
      console.log(
        `✓ 有 booking 的顧客中，${cwbAssignedPct.toFixed(1)}% 已有 assignedStaffId（覆蓋率高）。`,
      );
    } else {
      console.log(
        `⚠ 有 booking 的顧客中，僅 ${cwbAssignedPct.toFixed(1)}% 有 assignedStaffId（覆蓋率低）`,
      );
      console.log("  → 路線 B：先補齊顧客 assignedStaffId，再做 booking 快照修復。");
    }
  }

  // Booking.revenueStaffId 覆蓋率
  if (totalCompleted > 0) {
    if (bookingRevenuePct >= HIGH_COVERAGE) {
      console.log(
        `✓ Booking.revenueStaffId 覆蓋率 ${bookingRevenuePct.toFixed(1)}%（健康）。`,
      );
    } else {
      console.log(
        `⚠ Booking.revenueStaffId 覆蓋率僅 ${bookingRevenuePct.toFixed(1)}% — 大量 null。`,
      );
      if (cwbAssignedPct >= HIGH_COVERAGE) {
        console.log(
          "  → 路線 A：顧客 assignedStaffId 已高，但 booking 沒寫快照。",
        );
        console.log(
          "    建議 PR-1.5a future-only fix：新建 booking 時把 customer.assignedStaffId 寫入 booking.revenueStaffId。",
        );
      }
      if (nullRev_customerAssigned > 0) {
        console.log(
          `  → 路線 D：${nullRev_customerAssigned} 筆 booking 是 backfill candidates（customer 有直屬店長，booking 沒快照）。`,
        );
        console.log(
          "    若要 backfill，必須獨立 PR：先 dry-run、列明細、由使用者確認。",
        );
      }
    }
  }

  // serviceStaff 提醒
  if (nullRev_hasService > 0) {
    console.log(
      `⚠ ${nullRev_hasService} 筆 booking 是 revenueStaffId=null 但 serviceStaffId 有值。`,
    );
    console.log(
      "  → 路線 C：serviceStaff 是「實際服務者」，與「歸屬店長」概念不同；",
    );
    console.log(
      "    不可直接用 serviceStaff 等同 revenueStaff 做結算（會混淆營收歸屬）。",
    );
  }

  // 跨店異常
  if (
    anomalyBookingCustomerStore +
      anomalyRevenueStaffStore +
      anomalyAssignedStaffStore >
    0
  ) {
    console.log(
      "🔴 偵測到跨店異常（見上表）。在做 backfill 或結算前必須先釐清。",
    );
  } else {
    console.log("✓ 無跨店異常。");
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
