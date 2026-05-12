/**
 * staff-settlement-audit.ts — 純讀取統計（無寫入）
 *
 * 用途：店長服務費結算 Phase 1 規格的前置 audit。
 * 回報過去 6 個月（或自訂區間）的 COMPLETED booking 分布、補課比例、
 * 歸店家比例、BookingType 分布，以及 ADJUSTMENT 交易使用情況。
 *
 * **不會寫入任何資料**。沒有 INSERT / UPDATE / DELETE。
 *
 * Usage:
 *   # 預設：過去 6 個月、全部 store
 *   npx tsx scripts/staff-settlement-audit.ts
 *
 *   # 自訂區間（YYYY-MM-DD）
 *   npx tsx scripts/staff-settlement-audit.ts --from 2025-11-12 --to 2026-05-12
 *
 *   # 指定單一 store
 *   npx tsx scripts/staff-settlement-audit.ts --store <storeId>
 *
 *   # 輸出 CSV（key,value 兩欄）
 *   npx tsx scripts/staff-settlement-audit.ts --csv > audit.csv
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §8
 */

import { PrismaClient, BookingType } from "@prisma/client";

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
  // YYYY-MM-DD
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

// ── Main ──────────────────────────────────────────────────────────────────

interface Row {
  key: string;
  value: string | number;
  note?: string;
}

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const storeId = parseFlagValue("--store");

  // 預設：過去 6 個月（從今天往前推 180 天），到今天為止
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const from = parseDateOrDefault(parseFlagValue("--from"), sixMonthsAgo);
  const to = parseDateOrDefault(parseFlagValue("--to"), now);

  // bookingDate 是 @db.Date，用 ISO 日期 string 即可比較
  const bookingDateFilter = { gte: from, lte: to };
  // ADJUSTMENT 看 Transaction.createdAt
  const txCreatedAtFilter = { gte: from, lte: to };
  const storeFilter = storeId ? { storeId } : {};

  if (!wantCsv) {
    console.error(
      `[staff-settlement-audit] from=${from.toISOString().slice(0, 10)} ` +
        `to=${to.toISOString().slice(0, 10)} ` +
        `store=${storeId ?? "ALL"}`
    );
  }

  // ── 1. Booking 統計 ────────────────────────────────────────────────────
  const [
    totalCompleted,
    completedMakeup,
    completedRegular,
    completedOrphanRevenueStaff,
    completedMultiPeople,
    bookingTypeGroups,
    distinctRevenueStaff,
    topRevenueStaff,
  ] = await Promise.all([
    prisma.booking.count({
      where: { ...storeFilter, bookingStatus: "COMPLETED", bookingDate: bookingDateFilter },
    }),
    prisma.booking.count({
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
        isMakeup: true,
      },
    }),
    prisma.booking.count({
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
        isMakeup: false,
      },
    }),
    prisma.booking.count({
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
        revenueStaffId: null,
      },
    }),
    prisma.booking.count({
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
        people: { gt: 1 },
      },
    }),
    prisma.booking.groupBy({
      by: ["bookingType"],
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
      },
      _count: { id: true },
    }),
    prisma.booking
      .groupBy({
        by: ["revenueStaffId"],
        where: {
          ...storeFilter,
          bookingStatus: "COMPLETED",
          bookingDate: bookingDateFilter,
          revenueStaffId: { not: null },
        },
        _count: { id: true },
      })
      .then((rows) => rows.length),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...storeFilter,
        bookingStatus: "COMPLETED",
        bookingDate: bookingDateFilter,
        revenueStaffId: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
  ]);

  // ── 2. ADJUSTMENT 交易統計（贈送漏洞觀察）─────────────────────────────
  // Decimal 比較：用 0 即可（Prisma 會處理）
  const [adjustmentTotal, adjustmentZeroAmount, adjustmentNonZeroAmount] =
    await Promise.all([
      prisma.transaction.count({
        where: {
          ...storeFilter,
          transactionType: "ADJUSTMENT",
          createdAt: txCreatedAtFilter,
        },
      }),
      prisma.transaction.count({
        where: {
          ...storeFilter,
          transactionType: "ADJUSTMENT",
          createdAt: txCreatedAtFilter,
          amount: 0,
        },
      }),
      prisma.transaction.count({
        where: {
          ...storeFilter,
          transactionType: "ADJUSTMENT",
          createdAt: txCreatedAtFilter,
          NOT: { amount: 0 },
        },
      }),
    ]);

  // ── 3. 衍生指標 ──────────────────────────────────────────────────────
  const orphanPct = totalCompleted ? (completedOrphanRevenueStaff / totalCompleted) * 100 : 0;
  const makeupPct = totalCompleted ? (completedMakeup / totalCompleted) * 100 : 0;
  const multiPeoplePct = totalCompleted ? (completedMultiPeople / totalCompleted) * 100 : 0;
  const topStaffCount = topRevenueStaff[0]?._count.id ?? 0;
  const topStaffPct = totalCompleted ? (topStaffCount / totalCompleted) * 100 : 0;

  // 月均 ADJUSTMENT amount=0 筆數（粗算：days / 30）
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  const monthlyZeroAdj = (adjustmentZeroAmount / days) * 30;

  // ── 4. Output ────────────────────────────────────────────────────────
  const rows: Row[] = [
    { key: "區間 from", value: from.toISOString().slice(0, 10) },
    { key: "區間 to", value: to.toISOString().slice(0, 10) },
    { key: "store 範圍", value: storeId ?? "ALL" },

    { key: "Booking COMPLETED 總筆數", value: totalCompleted },
    {
      key: "  ├─ isMakeup = true（補課）",
      value: completedMakeup,
      note: `${makeupPct.toFixed(1)}%`,
    },
    { key: "  └─ isMakeup = false（一般）", value: completedRegular },
    {
      key: "  ⚠ revenueStaffId = null（歸店家）",
      value: completedOrphanRevenueStaff,
      note: `${orphanPct.toFixed(1)}%`,
    },
    {
      key: "  · people > 1（多人預約）",
      value: completedMultiPeople,
      note: `${multiPeoplePct.toFixed(1)}%`,
    },
  ];

  // BookingType 分布
  const typeCountMap: Record<string, number> = {};
  for (const r of bookingTypeGroups) {
    typeCountMap[r.bookingType] = r._count.id;
  }
  for (const t of Object.values(BookingType)) {
    rows.push({
      key: `  BookingType.${t}`,
      value: typeCountMap[t] ?? 0,
    });
  }

  rows.push(
    { key: "不同 revenueStaffId 數（有歸屬者）", value: distinctRevenueStaff },
    {
      key: "最高佔比店長完成服務筆數",
      value: topStaffCount,
      note: `${topStaffPct.toFixed(1)}%`,
    },
    { key: "Transaction ADJUSTMENT 總筆數", value: adjustmentTotal },
    {
      key: "  ├─ amount = 0（贈送漏洞特徵）",
      value: adjustmentZeroAmount,
      note: `月均 ≈ ${monthlyZeroAdj.toFixed(1)} 筆`,
    },
    { key: "  └─ amount ≠ 0（補登 / 退費 / 帳調）", value: adjustmentNonZeroAmount }
  );

  // ── 5. Render ────────────────────────────────────────────────────────
  if (wantCsv) {
    process.stdout.write("key,value,note\n");
    for (const r of rows) {
      const note = r.note ?? "";
      process.stdout.write(
        `${csvField(r.key)},${csvField(r.value)},${csvField(note)}\n`
      );
    }
    return;
  }

  console.log("\n=== Staff Settlement Audit (READ-ONLY) ===\n");
  console.table(
    rows.map((r) => ({
      項目: r.key,
      值: r.value,
      備註: r.note ?? "",
    }))
  );

  // 給 PR-1 規格文件回填的建議行動
  console.log("\n=== Phase 1 sanity checks ===");
  if (orphanPct > 5) {
    console.log(
      `⚠ revenueStaffId = null 比例 ${orphanPct.toFixed(1)}% > 5%：` +
        "Phase 1 結算試算會出現大量「歸店家」列，需與營運確認展示方式。"
    );
  } else {
    console.log(`✓ revenueStaffId = null 比例 ${orphanPct.toFixed(1)}%（合理）`);
  }
  if (makeupPct > 15) {
    console.log(
      `⚠ 補課佔比 ${makeupPct.toFixed(1)}% > 15%：` +
        "建議再次確認補課與一般服務同單價的決策。"
    );
  } else {
    console.log(`✓ 補課佔比 ${makeupPct.toFixed(1)}%（合理）`);
  }
  if (monthlyZeroAdj > 5) {
    console.log(
      `⚠ amount=0 ADJUSTMENT 月均 ${monthlyZeroAdj.toFixed(1)} 筆 > 5：` +
        "「免費服務漏洞」實際正在被使用，建議優先排 Phase 2 正式欄位。"
    );
  } else {
    console.log(
      `✓ amount=0 ADJUSTMENT 月均 ${monthlyZeroAdj.toFixed(1)} 筆（不顯著）`
    );
  }
  console.log("");
}

// CSV escape
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
