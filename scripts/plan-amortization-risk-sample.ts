/**
 * plan-amortization-risk-sample.ts — PR-2.1a 抽樣核對（READ-ONLY）
 *
 * 用途：PR-2.1 audit 標出 `CAN_COMPUTE_WITH_RISK` 的 booking — 也就是對應的
 * wallet 曾經被 amount=0 ADJUSTMENT 過。但 ADJUSTMENT 可能代表兩種完全不同
 * 的事：
 *
 *   (A) 「20 堂購買 + 後續手動贈送 2 堂」→ totalSessions 停留在 20，公式
 *       單堂金額被高估（12000/20=600 vs 真實 12000/22=545.45）
 *   (B) 「20 堂購買 + 客訴扣 1 堂後再補 1 堂」之類進出抵銷 → totalSessions
 *       不變仍是 20，公式單堂金額正確
 *
 * 兩者單看 schema 無法區分。本 script 列出每個 risk wallet 的完整脈絡，
 * 讓 operator 人工判斷該 wallet 屬於 (A) 還是 (B)。
 *
 * 關鍵 sanity check（自動算給 operator 看）：
 *   used (completed) + active (RESERVED/PENDING/CONFIRMED) + remaining
 *     vs wallet.totalSessions
 *   - 若相等 → totalSessions 已完整反映所有可用堂（含贈送）→ 屬 (B)
 *     公式單堂金額**可信**
 *   - 若 used+active+remaining > totalSessions → 某些堂從別處進來
 *     （adjustRemainingSessions 加堂，不更新 totalSessions）→ 屬 (A)
 *     公式單堂金額**被高估**
 *
 * **絕對只讀**。沒有 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 *
 * Usage:
 *   # 預設：過去 6 個月 booking 範圍內被使用的 wallet
 *   npx tsx scripts/plan-amortization-risk-sample.ts
 *
 *   # 全部歷史
 *   npx tsx scripts/plan-amortization-risk-sample.ts --all
 *
 *   # 自訂 / 指定店家 / CSV
 *   npx tsx scripts/plan-amortization-risk-sample.ts --from 2026-01-01 --to 2026-05-31
 *   npx tsx scripts/plan-amortization-risk-sample.ts --store <storeId>
 *   npx tsx scripts/plan-amortization-risk-sample.ts --csv > sample.csv
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── CLI helpers ───────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const wantAll = process.argv.includes("--all");
  const storeId = parseFlagValue("--store");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const from = wantAll ? null : parseDateOrDefault(parseFlagValue("--from"), sixMonthsAgo);
  const to = wantAll ? null : parseDateOrDefault(parseFlagValue("--to"), now);

  const storeFilter = storeId ? { storeId } : {};
  const dateFilter = from && to ? { bookingDate: { gte: from, lte: to } } : {};

  if (!wantCsv) {
    console.error(
      `[plan-amortization-risk-sample] mode=READ_ONLY from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"}`,
    );
  }

  // ── 1. 找出範圍內 COMPLETED booking 用到的所有 wallet IDs（含補課溯源）
  const bookings = await prisma.booking.findMany({
    where: {
      ...storeFilter,
      ...dateFilter,
      bookingStatus: "COMPLETED",
    },
    select: {
      id: true,
      customerPlanWalletId: true,
      isMakeup: true,
      makeupCredit: {
        select: {
          originalBooking: { select: { customerPlanWalletId: true } },
        },
      },
    },
  });

  const walletIdSet = new Set<string>();
  for (const b of bookings) {
    if (b.customerPlanWalletId) walletIdSet.add(b.customerPlanWalletId);
    const origWalletId = b.makeupCredit?.originalBooking?.customerPlanWalletId;
    if (origWalletId) walletIdSet.add(origWalletId);
  }
  const walletIds = [...walletIdSet];

  if (walletIds.length === 0) {
    console.log("\n（範圍內無 COMPLETED booking 對應任何 wallet）\n");
    return;
  }

  // ── 2. 撈每個 wallet 的完整資料（含 transactions / plan / bookings）
  const wallets = await prisma.customerPlanWallet.findMany({
    where: { id: { in: walletIds } },
    select: {
      id: true,
      purchasedPrice: true,
      totalSessions: true,
      remainingSessions: true,
      status: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      plan: {
        select: {
          id: true,
          name: true,
          category: true,
          sessionCount: true,
          price: true,
        },
      },
      transactions: {
        select: {
          id: true,
          transactionType: true,
          amount: true,
          quantity: true,
          note: true,
          createdAt: true,
          soldByStaffId: true,
          serviceStaffId: true,
        },
        orderBy: { createdAt: "asc" },
      },
      bookings: {
        select: {
          id: true,
          bookingStatus: true,
          bookingDate: true,
          isMakeup: true,
        },
      },
      sessions: {
        select: {
          status: true,
        },
      },
    },
  });

  // 過濾出有 ADJUSTMENT 紀錄的 wallet（這才是 risk sample 範圍）
  const riskWallets = wallets.filter((w) =>
    w.transactions.some((t) => t.transactionType === "ADJUSTMENT"),
  );

  if (riskWallets.length === 0) {
    console.log("\n✓ 範圍內的 wallet 都沒有 ADJUSTMENT 紀錄，無需抽樣核對。\n");
    return;
  }

  // ── 3. 撈 staff 名稱 map（給 soldByStaffId / serviceStaffId 顯示用）
  const staffIdSet = new Set<string>();
  for (const w of riskWallets) {
    for (const t of w.transactions) {
      if (t.soldByStaffId) staffIdSet.add(t.soldByStaffId);
      if (t.serviceStaffId) staffIdSet.add(t.serviceStaffId);
    }
  }
  const staffNameMap = new Map<string, string>();
  if (staffIdSet.size > 0) {
    const staff = await prisma.staff.findMany({
      where: { id: { in: [...staffIdSet] } },
      select: { id: true, displayName: true },
    });
    for (const s of staff) staffNameMap.set(s.id, s.displayName);
  }
  const staffName = (id: string | null | undefined): string =>
    id ? staffNameMap.get(id) ?? `(staff:${id.slice(-6)})` : "—";

  // ── 4. 對每個 wallet 算 sanity check
  type Verdict = "LIKELY_OK" | "LIKELY_UNDERCOUNTING" | "AMBIGUOUS";

  interface WalletSampleRow {
    walletId: string;
    customerName: string;
    planName: string;
    planCategory: string;
    planSessionCount: number;
    walletPurchasedPrice: number;
    walletTotalSessions: number;
    walletRemainingSessions: number;
    walletStatus: string;
    completedBookingCount: number;
    activeBookingCount: number;
    canceledBookingCount: number;
    noShowBookingCount: number;
    sessionRowCount: number;
    sessionStatusBreakdown: string;
    adjustmentCount: number;
    adjustmentQuantitySum: number;
    adjustmentZeroAmountCount: number;
    sessionDeductionCount: number;
    unitPriceCurrentCalc: number;
    inferredUsedPlusRemaining: number;
    sanityDelta: number; // (used + active + remaining) - totalSessions
    verdict: Verdict;
    reasoning: string;
  }

  const rows: WalletSampleRow[] = riskWallets.map((w) => {
    const txs = w.transactions;
    const adjustments = txs.filter((t) => t.transactionType === "ADJUSTMENT");
    const adjustmentCount = adjustments.length;
    const adjustmentQuantitySum = adjustments.reduce(
      (sum, t) => sum + (t.quantity ?? 0),
      0,
    );
    const adjustmentZeroAmountCount = adjustments.filter(
      (t) => Number(t.amount.toString()) === 0,
    ).length;
    const sessionDeductionCount = txs.filter(
      (t) => t.transactionType === "SESSION_DEDUCTION",
    ).length;

    const completedBookingCount = w.bookings.filter(
      (b) => b.bookingStatus === "COMPLETED",
    ).length;
    const activeBookingCount = w.bookings.filter(
      (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED",
    ).length;
    const canceledBookingCount = w.bookings.filter(
      (b) => b.bookingStatus === "CANCELLED",
    ).length;
    const noShowBookingCount = w.bookings.filter(
      (b) => b.bookingStatus === "NO_SHOW",
    ).length;

    const sessionRowCount = w.sessions.length;
    const breakdown = new Map<string, number>();
    for (const s of w.sessions)
      breakdown.set(s.status, (breakdown.get(s.status) ?? 0) + 1);
    const sessionStatusBreakdown = [...breakdown.entries()]
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");

    const purchasedPrice = Number(w.purchasedPrice.toString());
    const totalSessions = w.totalSessions;
    const unitPriceCurrentCalc =
      totalSessions > 0 ? purchasedPrice / totalSessions : 0;

    // Sanity: 已扣 + 進行中 + 剩 vs 宣告總堂
    const inferredUsedPlusRemaining =
      completedBookingCount + activeBookingCount + w.remainingSessions;
    const sanityDelta = inferredUsedPlusRemaining - totalSessions;

    let verdict: Verdict;
    let reasoning: string;
    if (sanityDelta === 0) {
      verdict = "LIKELY_OK";
      reasoning = `used(${completedBookingCount}) + active(${activeBookingCount}) + remaining(${w.remainingSessions}) = totalSessions(${totalSessions}) — totalSessions 看起來已含贈送，公式單堂金額可信`;
    } else if (sanityDelta > 0) {
      verdict = "LIKELY_UNDERCOUNTING";
      reasoning = `用量(${inferredUsedPlusRemaining}) > totalSessions(${totalSessions})，差 +${sanityDelta} 堂 — 疑似贈送透過 adjustRemainingSessions 加入但 totalSessions 沒同步更新，公式單堂金額可能被高估`;
    } else {
      verdict = "AMBIGUOUS";
      reasoning = `用量(${inferredUsedPlusRemaining}) < totalSessions(${totalSessions})，差 ${sanityDelta} 堂 — 可能有 VOIDED / 退款，需人工確認`;
    }

    return {
      walletId: w.id,
      customerName: w.customer.name,
      planName: w.plan?.name ?? "(unknown plan)",
      planCategory: w.plan?.category ?? "—",
      planSessionCount: w.plan?.sessionCount ?? 0,
      walletPurchasedPrice: purchasedPrice,
      walletTotalSessions: totalSessions,
      walletRemainingSessions: w.remainingSessions,
      walletStatus: w.status,
      completedBookingCount,
      activeBookingCount,
      canceledBookingCount,
      noShowBookingCount,
      sessionRowCount,
      sessionStatusBreakdown,
      adjustmentCount,
      adjustmentQuantitySum,
      adjustmentZeroAmountCount,
      sessionDeductionCount,
      unitPriceCurrentCalc,
      inferredUsedPlusRemaining,
      sanityDelta,
      verdict,
      reasoning,
    };
  });

  // 排序：UNDERCOUNTING 最前面（最需處理），再 AMBIGUOUS，再 LIKELY_OK
  rows.sort((a, b) => {
    const score = (v: Verdict) =>
      v === "LIKELY_UNDERCOUNTING" ? 0 : v === "AMBIGUOUS" ? 1 : 2;
    return score(a.verdict) - score(b.verdict);
  });

  // ── 5. Output ─────────────────────────────────────────────────────────
  if (wantCsv) {
    const HEADERS = [
      "walletId",
      "customerName",
      "planName",
      "planCategory",
      "planSessionCount",
      "walletPurchasedPrice",
      "walletTotalSessions",
      "walletRemainingSessions",
      "walletStatus",
      "completedBookingCount",
      "activeBookingCount",
      "canceledBookingCount",
      "noShowBookingCount",
      "sessionRowCount",
      "sessionStatusBreakdown",
      "adjustmentCount",
      "adjustmentZeroAmountCount",
      "adjustmentQuantitySum",
      "sessionDeductionCount",
      "unitPriceCurrentCalc",
      "inferredUsedPlusRemaining",
      "sanityDelta",
      "verdict",
      "reasoning",
    ];
    process.stdout.write(HEADERS.join(",") + "\n");
    for (const r of rows) {
      process.stdout.write(
        [
          r.walletId,
          r.customerName,
          r.planName,
          r.planCategory,
          r.planSessionCount,
          r.walletPurchasedPrice,
          r.walletTotalSessions,
          r.walletRemainingSessions,
          r.walletStatus,
          r.completedBookingCount,
          r.activeBookingCount,
          r.canceledBookingCount,
          r.noShowBookingCount,
          r.sessionRowCount,
          r.sessionStatusBreakdown,
          r.adjustmentCount,
          r.adjustmentZeroAmountCount,
          r.adjustmentQuantitySum,
          r.sessionDeductionCount,
          r.unitPriceCurrentCalc.toFixed(4),
          r.inferredUsedPlusRemaining,
          r.sanityDelta,
          r.verdict,
          r.reasoning,
        ]
          .map(csvField)
          .join(",") +
          "\n",
      );
    }
    return;
  }

  console.log("\n=== Plan Amortization Risk Sample (READ-ONLY) ===\n");
  console.log(
    `Filter: from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"}`,
  );
  console.log(
    `Total wallets touched by COMPLETED bookings: ${wallets.length}`,
  );
  console.log(`Of those, with ADJUSTMENT history: ${riskWallets.length}\n`);

  // 每個 wallet 詳細
  for (const r of rows) {
    console.log("─".repeat(78));
    const verdictIcon =
      r.verdict === "LIKELY_OK"
        ? "✓"
        : r.verdict === "LIKELY_UNDERCOUNTING"
          ? "🔴"
          : "⚠️";
    console.log(`${verdictIcon} ${r.verdict}  walletId=${r.walletId}`);
    console.log(`Customer: ${r.customerName}`);
    console.log(
      `Plan: ${r.planName}  (category=${r.planCategory}, plan.sessionCount=${r.planSessionCount})`,
    );
    console.log(
      `Wallet snapshot: purchasedPrice=$${r.walletPurchasedPrice}  totalSessions=${r.walletTotalSessions}  remainingSessions=${r.walletRemainingSessions}  status=${r.walletStatus}`,
    );
    console.log(
      `Bookings on this wallet: COMPLETED=${r.completedBookingCount} active=${r.activeBookingCount} canceled=${r.canceledBookingCount} no_show=${r.noShowBookingCount}`,
    );
    console.log(
      `WalletSession rows: ${r.sessionRowCount}  (${r.sessionStatusBreakdown})`,
    );
    console.log(
      `Transactions: ADJUSTMENT=${r.adjustmentCount} (amount=0: ${r.adjustmentZeroAmountCount}, quantity sum=${r.adjustmentQuantitySum})  SESSION_DEDUCTION=${r.sessionDeductionCount}`,
    );
    console.log(
      `Current calc: $${r.walletPurchasedPrice} / ${r.walletTotalSessions} = $${r.unitPriceCurrentCalc.toFixed(2)} per session`,
    );
    console.log(
      `Sanity: used+active+remaining = ${r.inferredUsedPlusRemaining}  vs totalSessions = ${r.walletTotalSessions}  → delta ${r.sanityDelta > 0 ? "+" : ""}${r.sanityDelta}`,
    );
    console.log(`Verdict: ${r.reasoning}`);

    // 列出 ADJUSTMENT 明細（最多 10 筆，給 operator 看 note）
    const wallet = riskWallets.find((w) => w.id === r.walletId)!;
    const adjustments = wallet.transactions.filter(
      (t) => t.transactionType === "ADJUSTMENT",
    );
    if (adjustments.length > 0) {
      console.log("ADJUSTMENT details:");
      for (const t of adjustments.slice(0, 10)) {
        const date = t.createdAt.toISOString().slice(0, 10);
        const amount = Number(t.amount.toString());
        const note = t.note ?? "—";
        const by = staffName(t.soldByStaffId);
        console.log(
          `  ${date}  amount=$${amount}  quantity=${t.quantity ?? "—"}  note="${note}"  by=${by}`,
        );
      }
      if (adjustments.length > 10) {
        console.log(`  ...還有 ${adjustments.length - 10} 筆未顯示（用 --csv 看完整）`);
      }
    }
  }

  // ── 6. Summary roll-up ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(78));
  console.log("=== Verdict roll-up ===");
  const verdictCounts = rows.reduce<Record<Verdict, number>>(
    (acc, r) => {
      acc[r.verdict]++;
      return acc;
    },
    { LIKELY_OK: 0, LIKELY_UNDERCOUNTING: 0, AMBIGUOUS: 0 },
  );
  console.table([
    {
      verdict: "✓ LIKELY_OK",
      count: verdictCounts.LIKELY_OK,
      meaning: "公式單堂金額可信，UI 可直接用",
    },
    {
      verdict: "🔴 LIKELY_UNDERCOUNTING",
      count: verdictCounts.LIKELY_UNDERCOUNTING,
      meaning: "totalSessions 沒含贈送，公式金額高估，UI 要 ⚠️ 標籤或排除",
    },
    {
      verdict: "⚠️ AMBIGUOUS",
      count: verdictCounts.AMBIGUOUS,
      meaning: "VOIDED / 退款混雜，需操作者個別確認",
    },
  ]);

  console.log("\n=== Next-step guidance ===");
  if (verdictCounts.LIKELY_UNDERCOUNTING > 0) {
    console.log(
      `🔴 有 ${verdictCounts.LIKELY_UNDERCOUNTING} 個 wallet 疑似 totalSessions 漏算贈送堂。`,
    );
    console.log(
      "  → PR-2.2 對這些 wallet 對應的 booking 加 ⚠️ 標籤 + 「需人工確認」狀態；",
    );
    console.log("    OR Phase 2 把贈送堂寫入 bonusSessions 欄位後再算。");
  }
  if (verdictCounts.AMBIGUOUS > 0) {
    console.log(
      `⚠️ 有 ${verdictCounts.AMBIGUOUS} 個 wallet 數字不一致（用量 < totalSessions），需 operator 個別檢查。`,
    );
  }
  if (
    verdictCounts.LIKELY_UNDERCOUNTING === 0 &&
    verdictCounts.AMBIGUOUS === 0
  ) {
    console.log("✓ 所有 risk wallet 都通過 sanity check，PR-2.2 可放心開做。");
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nFatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
