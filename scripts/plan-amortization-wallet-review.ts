/**
 * plan-amortization-wallet-review.ts — PR-2.1b 人工核對 worksheet（READ-ONLY）
 *
 * 用途：PR-2.1a 風險抽樣 (#132) 把 wallet 分成 LIKELY_OK / LIKELY_UNDERCOUNTING /
 * AMBIGUOUS 三種。AMBIGUOUS 與 LIKELY_UNDERCOUNTING 都不能直接用公式金額，
 * 需要 operator 個別判斷「這個 wallet 的正確總可使用堂數是多少」。
 *
 * 本 script 把所有 risk wallet 包成一份 CSV worksheet，給 operator 在
 * Excel / Google Sheets 開啟、填回判斷結果：
 *
 *   suggestedCorrectTotalSessions  ← operator 填正確總可使用堂數
 *   suggestedUnitPrice              ← operator 填 purchasedPrice / 上欄
 *   reviewNote                      ← 自由填寫核對心得
 *   operatorDecision                ← 建議用以下任一字串：
 *                                       CONFIRM_AS_IS
 *                                       OVERRIDE_TOTAL
 *                                       EXCLUDE_FROM_SETTLEMENT
 *
 * Operator 填完後，回傳 CSV → PR-2.2 UI 才知道每個 wallet 該怎麼算金額。
 *
 * **絕對只讀**。沒有 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 * 只用 Prisma findMany。
 *
 * Usage:
 *   # 預設：過去 6 個月 booking 範圍內的 wallet
 *   npx tsx scripts/plan-amortization-wallet-review.ts
 *
 *   # CSV worksheet（推薦：給 operator 填）
 *   npx tsx scripts/plan-amortization-wallet-review.ts --csv > wallet-review-2026-05-12.csv
 *
 *   # 全部歷史
 *   npx tsx scripts/plan-amortization-wallet-review.ts --all
 *
 *   # 篩 verdict（不傳 = 所有非 LIKELY_OK）
 *   npx tsx scripts/plan-amortization-wallet-review.ts --verdict=AMBIGUOUS
 *   npx tsx scripts/plan-amortization-wallet-review.ts --verdict=LIKELY_UNDERCOUNTING
 *   npx tsx scripts/plan-amortization-wallet-review.ts --verdict=all  # 包含 LIKELY_OK
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

function parseFlagWithEquals(flag: string): string | null {
  // 支援 --verdict=foo 與 --verdict foo 兩種寫法
  const eqArg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eqArg) return eqArg.slice(flag.length + 1);
  return parseFlagValue(flag);
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

// ── Verdict 計算（與 PR-2.1a 同邏輯，保持一致）────────────────────────

type Verdict = "LIKELY_OK" | "LIKELY_UNDERCOUNTING" | "AMBIGUOUS";

interface WalletData {
  id: string;
  customerName: string;
  planName: string;
  planCategory: string;
  planSessionCount: number;
  purchasedPrice: number;
  totalSessions: number;
  remainingSessions: number;
  walletStatus: string;
  completedBookings: number;
  activeBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  sessionRowCount: number;
  sessionStatusBreakdown: string;
  adjustments: Array<{
    createdAt: Date;
    amount: number;
    quantity: number | null;
    note: string | null;
    byStaffName: string;
  }>;
  adjustmentCount: number;
  zeroAmountAdjustmentCount: number;
  adjustmentQuantitySum: number;
  sessionDeductionCount: number;
  formulaUnitPrice: number;
  sanityDelta: number;
  verdict: Verdict;
  reasoning: string;
}

function computeVerdict(
  completed: number,
  active: number,
  remaining: number,
  totalSessions: number,
): { verdict: Verdict; delta: number; reasoning: string } {
  const inferred = completed + active + remaining;
  const delta = inferred - totalSessions;
  if (delta === 0) {
    return {
      verdict: "LIKELY_OK",
      delta,
      reasoning: `used(${completed}) + active(${active}) + remaining(${remaining}) = totalSessions(${totalSessions})，公式可信`,
    };
  }
  if (delta > 0) {
    return {
      verdict: "LIKELY_UNDERCOUNTING",
      delta,
      reasoning: `用量(${inferred}) > totalSessions(${totalSessions})，差 +${delta} → totalSessions 可能漏算贈送堂，公式高估`,
    };
  }
  return {
    verdict: "AMBIGUOUS",
    delta,
    reasoning: `用量(${inferred}) < totalSessions(${totalSessions})，差 ${delta} → 可能有 VOIDED / 退款，需個別確認`,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const wantAll = process.argv.includes("--all");
  const storeId = parseFlagValue("--store");
  const verdictFilter = (parseFlagWithEquals("--verdict") ?? "non_ok").toUpperCase();

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const from = wantAll ? null : parseDateOrDefault(parseFlagValue("--from"), sixMonthsAgo);
  const to = wantAll ? null : parseDateOrDefault(parseFlagValue("--to"), now);

  const storeFilter = storeId ? { storeId } : {};
  const dateFilter = from && to ? { bookingDate: { gte: from, lte: to } } : {};

  if (!wantCsv) {
    console.error(
      `[plan-amortization-wallet-review] mode=READ_ONLY from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"} verdict-filter=${verdictFilter}`,
    );
  }

  // ── 1. 找出範圍內 COMPLETED booking 涉及的所有 walletId（含補課溯源） ──
  const bookings = await prisma.booking.findMany({
    where: {
      ...storeFilter,
      ...dateFilter,
      bookingStatus: "COMPLETED",
    },
    select: {
      customerPlanWalletId: true,
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
    const orig = b.makeupCredit?.originalBooking?.customerPlanWalletId;
    if (orig) walletIdSet.add(orig);
  }
  const walletIds = [...walletIdSet];

  if (walletIds.length === 0) {
    console.log("\n（範圍內無 wallet 可審閱）\n");
    return;
  }

  // ── 2. 撈每個 wallet 完整資料 ────────────────────────────────────────
  const walletsRaw = await prisma.customerPlanWallet.findMany({
    where: { id: { in: walletIds } },
    select: {
      id: true,
      purchasedPrice: true,
      totalSessions: true,
      remainingSessions: true,
      status: true,
      customer: { select: { name: true } },
      plan: {
        select: { name: true, category: true, sessionCount: true },
      },
      bookings: {
        select: { bookingStatus: true },
      },
      sessions: { select: { status: true } },
      transactions: {
        select: {
          transactionType: true,
          amount: true,
          quantity: true,
          note: true,
          createdAt: true,
          soldByStaffId: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // ── 3. Staff name map ────────────────────────────────────────────────
  const staffIdSet = new Set<string>();
  for (const w of walletsRaw)
    for (const t of w.transactions)
      if (t.soldByStaffId) staffIdSet.add(t.soldByStaffId);
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

  // ── 4. 計算每個 wallet 的 analysis ─────────────────────────────────
  const wallets: WalletData[] = walletsRaw.map((w) => {
    const txs = w.transactions;
    const adjustmentTxs = txs.filter((t) => t.transactionType === "ADJUSTMENT");
    const adjustments = adjustmentTxs.map((t) => ({
      createdAt: t.createdAt,
      amount: Number(t.amount.toString()),
      quantity: t.quantity ?? null,
      note: t.note,
      byStaffName: staffName(t.soldByStaffId),
    }));
    const adjustmentCount = adjustments.length;
    const zeroAmountAdjustmentCount = adjustments.filter(
      (a) => a.amount === 0,
    ).length;
    const adjustmentQuantitySum = adjustments.reduce(
      (sum, a) => sum + (a.quantity ?? 0),
      0,
    );
    const sessionDeductionCount = txs.filter(
      (t) => t.transactionType === "SESSION_DEDUCTION",
    ).length;

    const completedBookings = w.bookings.filter(
      (b) => b.bookingStatus === "COMPLETED",
    ).length;
    const activeBookings = w.bookings.filter(
      (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED",
    ).length;
    const cancelledBookings = w.bookings.filter(
      (b) => b.bookingStatus === "CANCELLED",
    ).length;
    const noShowBookings = w.bookings.filter(
      (b) => b.bookingStatus === "NO_SHOW",
    ).length;

    const breakdown = new Map<string, number>();
    for (const s of w.sessions)
      breakdown.set(s.status, (breakdown.get(s.status) ?? 0) + 1);
    const sessionStatusBreakdown = [...breakdown.entries()]
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    const sessionRowCount = w.sessions.length;

    const purchasedPrice = Number(w.purchasedPrice.toString());
    const totalSessions = w.totalSessions;
    const formulaUnitPrice =
      totalSessions > 0 ? purchasedPrice / totalSessions : 0;

    const { verdict, delta, reasoning } = computeVerdict(
      completedBookings,
      activeBookings,
      w.remainingSessions,
      totalSessions,
    );

    return {
      id: w.id,
      customerName: w.customer.name,
      planName: w.plan?.name ?? "(unknown)",
      planCategory: w.plan?.category ?? "—",
      planSessionCount: w.plan?.sessionCount ?? 0,
      purchasedPrice,
      totalSessions,
      remainingSessions: w.remainingSessions,
      walletStatus: w.status,
      completedBookings,
      activeBookings,
      cancelledBookings,
      noShowBookings,
      sessionRowCount,
      sessionStatusBreakdown,
      adjustments,
      adjustmentCount,
      zeroAmountAdjustmentCount,
      adjustmentQuantitySum,
      sessionDeductionCount,
      formulaUnitPrice,
      sanityDelta: delta,
      verdict,
      reasoning,
    };
  });

  // ── 5. Verdict 篩選 ──────────────────────────────────────────────────
  let filtered: WalletData[];
  if (verdictFilter === "ALL") {
    filtered = wallets;
  } else if (
    verdictFilter === "LIKELY_OK" ||
    verdictFilter === "LIKELY_UNDERCOUNTING" ||
    verdictFilter === "AMBIGUOUS"
  ) {
    filtered = wallets.filter((w) => w.verdict === verdictFilter);
  } else {
    // 預設 NON_OK：UNDERCOUNTING + AMBIGUOUS
    filtered = wallets.filter((w) => w.verdict !== "LIKELY_OK");
  }

  // 排序：UNDERCOUNTING 先，AMBIGUOUS 次，OK 最後
  const verdictScore = (v: Verdict) =>
    v === "LIKELY_UNDERCOUNTING" ? 0 : v === "AMBIGUOUS" ? 1 : 2;
  filtered.sort((a, b) => verdictScore(a.verdict) - verdictScore(b.verdict));

  if (filtered.length === 0) {
    console.log(`\n（篩選後無 wallet：verdict=${verdictFilter}）\n`);
    return;
  }

  // ── 6. Output ────────────────────────────────────────────────────────
  if (wantCsv) {
    // CSV worksheet：每 wallet 一列，最後三欄留白給 operator 填
    const HEADERS = [
      "walletId",
      "customerName",
      "planName",
      "planCategory",
      "planSessionCount",
      "purchasedPrice",
      "totalSessions",
      "remainingSessions",
      "walletStatus",
      "completedBookings",
      "activeBookings",
      "cancelledBookings",
      "noShowBookings",
      "sessionRowCount",
      "sessionStatusBreakdown",
      "adjustmentCount",
      "zeroAmountAdjustmentCount",
      "adjustmentQuantitySum",
      "sessionDeductionCount",
      "adjustmentDetails",
      "formulaUnitPrice",
      "sanityDelta",
      "verdict",
      "reasoning",
      // ↓↓↓ Operator review columns（出 CSV 時留白）↓↓↓
      "suggestedCorrectTotalSessions",
      "suggestedUnitPrice",
      "reviewNote",
      "operatorDecision",
    ];
    process.stdout.write(HEADERS.join(",") + "\n");
    for (const w of filtered) {
      const adjDetails = w.adjustments
        .map(
          (a) =>
            `${fmtDate(a.createdAt)} amt=${a.amount} q=${a.quantity ?? "—"} note=${a.note ?? "—"} by=${a.byStaffName}`,
        )
        .join(" | ");
      const row = [
        w.id,
        w.customerName,
        w.planName,
        w.planCategory,
        w.planSessionCount,
        w.purchasedPrice,
        w.totalSessions,
        w.remainingSessions,
        w.walletStatus,
        w.completedBookings,
        w.activeBookings,
        w.cancelledBookings,
        w.noShowBookings,
        w.sessionRowCount,
        w.sessionStatusBreakdown,
        w.adjustmentCount,
        w.zeroAmountAdjustmentCount,
        w.adjustmentQuantitySum,
        w.sessionDeductionCount,
        adjDetails,
        w.formulaUnitPrice.toFixed(4),
        w.sanityDelta,
        w.verdict,
        w.reasoning,
        // 留白給 operator 填
        "",
        "",
        "",
        "",
      ];
      process.stdout.write(row.map(csvField).join(",") + "\n");
    }
    return;
  }

  // 人類可讀模式
  console.log("\n=== Plan Amortization Wallet Review Worksheet (READ-ONLY) ===\n");
  console.log(
    `Filter: from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"} verdict=${verdictFilter}`,
  );
  console.log(`Wallets to review: ${filtered.length}\n`);

  // 每筆 wallet 詳細
  filtered.forEach((w, i) => {
    console.log("─".repeat(78));
    const icon =
      w.verdict === "LIKELY_OK"
        ? "✓"
        : w.verdict === "LIKELY_UNDERCOUNTING"
          ? "🔴"
          : "⚠️";
    console.log(`#${i + 1}  ${icon} ${w.verdict}    walletId=${w.id}`);
    console.log(`Customer: ${w.customerName}`);
    console.log(
      `Plan: ${w.planName}  (category=${w.planCategory}, plan.sessionCount=${w.planSessionCount})`,
    );
    console.log(
      `Snapshot: purchasedPrice=$${w.purchasedPrice}  totalSessions=${w.totalSessions}  remainingSessions=${w.remainingSessions}  status=${w.walletStatus}`,
    );
    console.log(
      `Bookings: COMPLETED=${w.completedBookings}  active=${w.activeBookings}  cancelled=${w.cancelledBookings}  no_show=${w.noShowBookings}`,
    );
    console.log(
      `WalletSession rows: ${w.sessionRowCount}  (${w.sessionStatusBreakdown})`,
    );
    console.log(
      `Transactions: ADJUSTMENT=${w.adjustmentCount} (amount=0: ${w.zeroAmountAdjustmentCount}, qty sum=${w.adjustmentQuantitySum})  SESSION_DEDUCTION=${w.sessionDeductionCount}`,
    );
    console.log(
      `Formula: $${w.purchasedPrice} / ${w.totalSessions} = $${w.formulaUnitPrice.toFixed(2)} per session`,
    );
    console.log(
      `Sanity delta: ${w.sanityDelta > 0 ? "+" : ""}${w.sanityDelta}  →  ${w.reasoning}`,
    );

    if (w.adjustments.length > 0) {
      console.log("ADJUSTMENT history:");
      for (const a of w.adjustments) {
        console.log(
          `  ${fmtDate(a.createdAt)}  amount=$${a.amount}  quantity=${a.quantity ?? "—"}  note="${a.note ?? "—"}"  by=${a.byStaffName}`,
        );
      }
    }

    // Operator fill-in section
    console.log("\n▼ Operator review（請在 CSV 模式下填寫）:");
    console.log(
      "  suggestedCorrectTotalSessions: ________   (e.g. 22 if 20+2 bonus)",
    );
    console.log(
      "  suggestedUnitPrice            : ________   (= purchasedPrice ÷ 上欄)",
    );
    console.log("  reviewNote                    : ____________________________");
    console.log(
      "  operatorDecision              : CONFIRM_AS_IS / OVERRIDE_TOTAL / EXCLUDE_FROM_SETTLEMENT",
    );
  });

  // Verdict roll-up
  console.log("\n" + "=".repeat(78));
  const counts = filtered.reduce<Record<Verdict, number>>(
    (acc, w) => {
      acc[w.verdict]++;
      return acc;
    },
    { LIKELY_OK: 0, LIKELY_UNDERCOUNTING: 0, AMBIGUOUS: 0 },
  );
  console.log("=== Verdict roll-up ===");
  console.table([
    {
      verdict: "🔴 LIKELY_UNDERCOUNTING",
      count: counts.LIKELY_UNDERCOUNTING,
      typical_action: "OVERRIDE_TOTAL（填入加贈送後的真實總堂）",
    },
    {
      verdict: "⚠️ AMBIGUOUS",
      count: counts.AMBIGUOUS,
      typical_action: "個別判斷：可能是 VOIDED 預約 → CONFIRM_AS_IS；或退款 → EXCLUDE",
    },
    {
      verdict: "✓ LIKELY_OK",
      count: counts.LIKELY_OK,
      typical_action: "CONFIRM_AS_IS（直接用公式金額）",
    },
  ]);

  console.log("\n=== Workflow ===");
  console.log("1. 用 --csv 模式產出 CSV worksheet:");
  console.log(
    "     npx tsx scripts/plan-amortization-wallet-review.ts --csv > wallet-review.csv",
  );
  console.log("2. Operator 在 Excel / Sheets 開啟，填四欄：");
  console.log("     suggestedCorrectTotalSessions  ← 真實總可使用堂數");
  console.log("     suggestedUnitPrice             ← purchasedPrice ÷ 真實總堂");
  console.log("     reviewNote                     ← 文字備註");
  console.log(
    "     operatorDecision               ← CONFIRM_AS_IS / OVERRIDE_TOTAL / EXCLUDE_FROM_SETTLEMENT",
  );
  console.log("3. 填完回傳給 dev 端，PR-2.2 才開始：");
  console.log(
    "     - 多數 CONFIRM_AS_IS    → UI 用公式金額即可",
  );
  console.log(
    "     - 多數 OVERRIDE_TOTAL   → UI 加 wallet-level overrides 表",
  );
  console.log(
    "     - 多數 EXCLUDE          → UI 把那批 booking 列「需人工確認」",
  );
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nFatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
