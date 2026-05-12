/**
 * plan-amortization-audit.ts — 純讀取統計（無寫入）
 *
 * 用途：PR-2.1 read-only audit。盤點每筆 COMPLETED booking 是否能可靠
 * 用「方案實收金額 ÷ 總可使用堂數」算出單堂金額，作為 PR-2.2 真正修正
 * 試算頁金額邏輯前的可行性檢查。
 *
 * **絕對只讀**。沒有 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 * 只用 Prisma findMany / count。
 *
 * 規則（user 拍板 2026-05-12）：
 *   方案單堂金額 = 顧客方案實收金額 ÷ 總可使用堂數
 *   範例：20 堂 + 贈送 2 堂、實收 12,000 → 12000 / 22 = 545.45
 *   重點：贈送堂要進分母，因為顧客實際能用 22 次。
 *
 * 已知 schema 風險：
 *   - CustomerPlanWallet 沒有獨立的 bonusSessions 欄位，只有 totalSessions
 *   - 若店家把贈送堂寫進 ServicePlan.sessionCount（→ wallet.totalSessions），公式正確
 *   - 若店家是購買後用 adjustRemainingSessions 加贈，wallet.totalSessions 不會更新 →
 *     公式被高估（用 12000/20 算成 600，而非 12000/22 算成 545.45）
 *
 * 本 audit 同時統計：
 *   - 每筆 booking 能否追到 wallet（直接或透過 MakeupCredit）
 *   - 該 wallet 是否有 purchasedPrice + totalSessions > 0
 *   - 該 wallet 是否曾被 amount=0 ADJUSTMENT（疑似贈送繞路 → 總堂可能不準）
 *   - 單堂金額分布（distinct 值統計）
 *
 * Usage:
 *   # 預設：過去 6 個月、全部 store
 *   npx tsx scripts/plan-amortization-audit.ts
 *
 *   # 全部歷史
 *   npx tsx scripts/plan-amortization-audit.ts --all
 *
 *   # 自訂區間 / 指定店家
 *   npx tsx scripts/plan-amortization-audit.ts --from 2026-01-01 --to 2026-05-31
 *   npx tsx scripts/plan-amortization-audit.ts --store <storeId>
 *
 *   # CSV
 *   npx tsx scripts/plan-amortization-audit.ts --csv > amortization-audit.csv
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

function pct(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ── 分類 ──────────────────────────────────────────────────────────────────

type Classification =
  | "CAN_COMPUTE_CLEAN" //  直接 wallet + purchasedPrice + sessions，且無 ADJUSTMENT 嫌疑
  | "CAN_COMPUTE_WITH_RISK" // 同上但 wallet 曾被 amount=0 ADJUSTMENT → totalSessions 可能漏算贈送
  | "CAN_COMPUTE_VIA_MAKEUP" // 補課 booking 透過 MakeupCredit 溯源原 wallet
  | "NEEDS_REVIEW_NO_WALLET" // PACKAGE_SESSION 但 customerPlanWalletId = null
  | "NEEDS_REVIEW_NO_PRICE" // wallet 存在但 purchasedPrice 為 null/0
  | "NEEDS_REVIEW_NO_SESSIONS" // wallet 存在但 totalSessions ≤ 0
  | "NEEDS_REVIEW_MAKEUP_NO_ORIGINAL" // 補課但原 booking 也沒 wallet
  | "SKIP_FIRST_TRIAL" // 體驗，預期無 wallet 無金額
  | "SKIP_SINGLE_NO_WALLET"; // SINGLE 沒掛 wallet（業務常態）

interface Row {
  bookingId: string;
  bookingDate: Date;
  bookingType: string;
  isMakeup: boolean;
  storeId: string;
  customerName: string;
  walletId: string | null;
  walletSource: "direct" | "via_makeup" | "none";
  purchasedPrice: number | null;
  totalSessions: number | null;
  unitPrice: number | null; // null 表示無法算
  hasZeroAmountAdjustment: boolean;
  classification: Classification;
  note: string;
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
      `[plan-amortization-audit] mode=READ_ONLY from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"}`,
    );
  }

  // ── 1. 抓 COMPLETED bookings（含必要關聯）─────────────────────────────
  const bookings = await prisma.booking.findMany({
    where: {
      ...storeFilter,
      ...dateFilter,
      bookingStatus: "COMPLETED",
    },
    select: {
      id: true,
      bookingDate: true,
      bookingType: true,
      isMakeup: true,
      storeId: true,
      customerPlanWalletId: true,
      makeupCreditId: true,
      customer: { select: { name: true } },
      customerPlanWallet: {
        select: {
          id: true,
          purchasedPrice: true,
          totalSessions: true,
          // 為了判斷 ADJUSTMENT 風險，把該 wallet 的 transactions 一起拉
          transactions: {
            where: { transactionType: "ADJUSTMENT" },
            select: { amount: true, createdAt: true },
          },
        },
      },
      makeupCredit: {
        select: {
          originalBooking: {
            select: {
              id: true,
              customerPlanWalletId: true,
              customerPlanWallet: {
                select: {
                  id: true,
                  purchasedPrice: true,
                  totalSessions: true,
                  transactions: {
                    where: { transactionType: "ADJUSTMENT" },
                    select: { amount: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }],
  });

  // ── 2. 逐筆分類 ──────────────────────────────────────────────────────
  const rows: Row[] = bookings.map((b) => {
    const base = {
      bookingId: b.id,
      bookingDate: b.bookingDate,
      bookingType: b.bookingType,
      isMakeup: b.isMakeup,
      storeId: b.storeId,
      customerName: b.customer.name,
    };

    // 先解出 wallet（直接 or 透過 makeup）
    let wallet: {
      id: string;
      purchasedPrice: { toString(): string } | null;
      totalSessions: number;
      transactions: Array<{ amount: { toString(): string } }>;
    } | null = b.customerPlanWallet;
    let walletSource: Row["walletSource"] = wallet ? "direct" : "none";

    if (!wallet && b.isMakeup) {
      const orig = b.makeupCredit?.originalBooking;
      if (orig?.customerPlanWallet) {
        wallet = orig.customerPlanWallet;
        walletSource = "via_makeup";
      }
    }

    // 沒有 wallet 的分類
    if (!wallet) {
      if (b.bookingType === "FIRST_TRIAL") {
        return {
          ...base,
          walletId: null,
          walletSource: "none",
          purchasedPrice: null,
          totalSessions: null,
          unitPrice: null,
          hasZeroAmountAdjustment: false,
          classification: "SKIP_FIRST_TRIAL",
          note: "體驗預約，預期無方案金額",
        };
      }
      if (b.bookingType === "SINGLE") {
        return {
          ...base,
          walletId: null,
          walletSource: "none",
          purchasedPrice: null,
          totalSessions: null,
          unitPrice: null,
          hasZeroAmountAdjustment: false,
          classification: "SKIP_SINGLE_NO_WALLET",
          note: "單次預約無掛 wallet（常見），跳過攤提計算",
        };
      }
      if (b.isMakeup) {
        return {
          ...base,
          walletId: null,
          walletSource: "none",
          purchasedPrice: null,
          totalSessions: null,
          unitPrice: null,
          hasZeroAmountAdjustment: false,
          classification: "NEEDS_REVIEW_MAKEUP_NO_ORIGINAL",
          note: "補課預約但原 booking 沒 wallet，無法溯源",
        };
      }
      // PACKAGE_SESSION 沒 wallet：絕對需 review
      return {
        ...base,
        walletId: null,
        walletSource: "none",
        purchasedPrice: null,
        totalSessions: null,
        unitPrice: null,
        hasZeroAmountAdjustment: false,
        classification: "NEEDS_REVIEW_NO_WALLET",
        note: `${b.bookingType} 但無 customerPlanWalletId（舊資料 / import 殘留？）`,
      };
    }

    // 有 wallet：檢查 price + sessions
    const price = wallet.purchasedPrice ? Number(wallet.purchasedPrice.toString()) : null;
    const sessions = wallet.totalSessions;
    const hasZeroAdj = wallet.transactions.some(
      (t) => Number(t.amount.toString()) === 0,
    );

    if (price === null || price <= 0) {
      return {
        ...base,
        walletId: wallet.id,
        walletSource,
        purchasedPrice: price,
        totalSessions: sessions,
        unitPrice: null,
        hasZeroAmountAdjustment: hasZeroAdj,
        classification: "NEEDS_REVIEW_NO_PRICE",
        note: "wallet 存在但 purchasedPrice 為 null/0",
      };
    }
    if (sessions <= 0) {
      return {
        ...base,
        walletId: wallet.id,
        walletSource,
        purchasedPrice: price,
        totalSessions: sessions,
        unitPrice: null,
        hasZeroAmountAdjustment: hasZeroAdj,
        classification: "NEEDS_REVIEW_NO_SESSIONS",
        note: "wallet.totalSessions ≤ 0",
      };
    }

    // 可以計算
    const unitPrice = price / sessions;
    let classification: Classification;
    let note: string;
    if (walletSource === "via_makeup") {
      classification = "CAN_COMPUTE_VIA_MAKEUP";
      note = "補課，溯源原 booking 的 wallet 計算";
    } else if (hasZeroAdj) {
      classification = "CAN_COMPUTE_WITH_RISK";
      note = `wallet 曾被 amount=0 ADJUSTMENT (${wallet.transactions.length} 筆) — totalSessions 可能不含贈送堂，單價可能高估`;
    } else {
      classification = "CAN_COMPUTE_CLEAN";
      note = `${price} / ${sessions} = ${unitPrice.toFixed(2)}`;
    }

    return {
      ...base,
      walletId: wallet.id,
      walletSource,
      purchasedPrice: price,
      totalSessions: sessions,
      unitPrice,
      hasZeroAmountAdjustment: hasZeroAdj,
      classification,
      note,
    };
  });

  // ── 3. Summary ──────────────────────────────────────────────────────
  const summary: Record<Classification, number> = {
    CAN_COMPUTE_CLEAN: 0,
    CAN_COMPUTE_WITH_RISK: 0,
    CAN_COMPUTE_VIA_MAKEUP: 0,
    NEEDS_REVIEW_NO_WALLET: 0,
    NEEDS_REVIEW_NO_PRICE: 0,
    NEEDS_REVIEW_NO_SESSIONS: 0,
    NEEDS_REVIEW_MAKEUP_NO_ORIGINAL: 0,
    SKIP_FIRST_TRIAL: 0,
    SKIP_SINGLE_NO_WALLET: 0,
  };
  for (const r of rows) summary[r.classification]++;
  const total = rows.length;
  const canComputeTotal =
    summary.CAN_COMPUTE_CLEAN +
    summary.CAN_COMPUTE_WITH_RISK +
    summary.CAN_COMPUTE_VIA_MAKEUP;
  const needsReviewTotal =
    summary.NEEDS_REVIEW_NO_WALLET +
    summary.NEEDS_REVIEW_NO_PRICE +
    summary.NEEDS_REVIEW_NO_SESSIONS +
    summary.NEEDS_REVIEW_MAKEUP_NO_ORIGINAL;
  const skipTotal = summary.SKIP_FIRST_TRIAL + summary.SKIP_SINGLE_NO_WALLET;

  // ── 4. 單堂金額分布（只看 CAN_COMPUTE_*）─────────────────────────────
  const priceBuckets = new Map<string, { count: number; clean: number; risk: number }>();
  for (const r of rows) {
    if (r.unitPrice === null) continue;
    const key = r.unitPrice.toFixed(2);
    const b = priceBuckets.get(key) ?? { count: 0, clean: 0, risk: 0 };
    b.count++;
    if (r.classification === "CAN_COMPUTE_CLEAN") b.clean++;
    if (r.classification === "CAN_COMPUTE_WITH_RISK") b.risk++;
    priceBuckets.set(key, b);
  }

  // ── 5. Per-staff 模擬（只看 CAN_COMPUTE_*）— 但這版 audit 沒抓 revenueStaffId，先省略
  //     PR-2.1 的目標是「資料層可行性」，店長明細留給 PR-2.2 真正改 query 時做。

  // ── 6. Output ────────────────────────────────────────────────────────
  if (wantCsv) {
    const HEADERS = [
      "bookingId",
      "bookingDate",
      "bookingType",
      "isMakeup",
      "storeId",
      "customerName",
      "walletId",
      "walletSource",
      "purchasedPrice",
      "totalSessions",
      "unitPrice",
      "hasZeroAmountAdjustment",
      "classification",
      "note",
    ];
    process.stdout.write(HEADERS.join(",") + "\n");
    for (const r of rows) {
      process.stdout.write(
        [
          r.bookingId,
          fmtDate(r.bookingDate),
          r.bookingType,
          r.isMakeup,
          r.storeId,
          r.customerName,
          r.walletId ?? "",
          r.walletSource,
          r.purchasedPrice ?? "",
          r.totalSessions ?? "",
          r.unitPrice !== null ? r.unitPrice.toFixed(4) : "",
          r.hasZeroAmountAdjustment,
          r.classification,
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
  console.log("\n=== Plan Amortization Audit (READ-ONLY) ===\n");
  console.log(
    `Filter: from=${fmtDate(from)} to=${fmtDate(to)} store=${storeId ?? "ALL"}`,
  );
  console.log(`COMPLETED bookings: ${total}\n`);

  if (total === 0) {
    console.log("（無資料）");
    return;
  }

  console.log("=== Classification summary ===");
  console.table([
    {
      group: "✅ 可計算",
      label: "CAN_COMPUTE_CLEAN",
      count: summary.CAN_COMPUTE_CLEAN,
      pct: pct(summary.CAN_COMPUTE_CLEAN, total),
      meaning: "直接 wallet + 無 ADJUSTMENT 嫌疑",
    },
    {
      group: "⚠️ 可計算但有風險",
      label: "CAN_COMPUTE_WITH_RISK",
      count: summary.CAN_COMPUTE_WITH_RISK,
      pct: pct(summary.CAN_COMPUTE_WITH_RISK, total),
      meaning: "wallet 曾被 amount=0 ADJUSTMENT，可能漏算贈送 → 單價高估",
    },
    {
      group: "✅ 可計算",
      label: "CAN_COMPUTE_VIA_MAKEUP",
      count: summary.CAN_COMPUTE_VIA_MAKEUP,
      pct: pct(summary.CAN_COMPUTE_VIA_MAKEUP, total),
      meaning: "補課溯源原 wallet 計算",
    },
    {
      group: "🔴 需人工確認",
      label: "NEEDS_REVIEW_NO_WALLET",
      count: summary.NEEDS_REVIEW_NO_WALLET,
      pct: pct(summary.NEEDS_REVIEW_NO_WALLET, total),
      meaning: "PACKAGE_SESSION 但 customerPlanWalletId 為 null",
    },
    {
      group: "🔴 需人工確認",
      label: "NEEDS_REVIEW_NO_PRICE",
      count: summary.NEEDS_REVIEW_NO_PRICE,
      pct: pct(summary.NEEDS_REVIEW_NO_PRICE, total),
      meaning: "wallet 存在但 purchasedPrice 為 null/0",
    },
    {
      group: "🔴 需人工確認",
      label: "NEEDS_REVIEW_NO_SESSIONS",
      count: summary.NEEDS_REVIEW_NO_SESSIONS,
      pct: pct(summary.NEEDS_REVIEW_NO_SESSIONS, total),
      meaning: "wallet.totalSessions ≤ 0",
    },
    {
      group: "🔴 需人工確認",
      label: "NEEDS_REVIEW_MAKEUP_NO_ORIGINAL",
      count: summary.NEEDS_REVIEW_MAKEUP_NO_ORIGINAL,
      pct: pct(summary.NEEDS_REVIEW_MAKEUP_NO_ORIGINAL, total),
      meaning: "補課但原 booking 也沒 wallet",
    },
    {
      group: "⏭ 跳過",
      label: "SKIP_FIRST_TRIAL",
      count: summary.SKIP_FIRST_TRIAL,
      pct: pct(summary.SKIP_FIRST_TRIAL, total),
      meaning: "體驗預約，預期無方案金額",
    },
    {
      group: "⏭ 跳過",
      label: "SKIP_SINGLE_NO_WALLET",
      count: summary.SKIP_SINGLE_NO_WALLET,
      pct: pct(summary.SKIP_SINGLE_NO_WALLET, total),
      meaning: "單次預約無 wallet（業務常態）",
    },
  ]);

  console.log("\n=== Coverage roll-up ===");
  console.table([
    { kind: "✅ 可計算（含風險）", count: canComputeTotal, pct: pct(canComputeTotal, total) },
    { kind: "🔴 需人工確認", count: needsReviewTotal, pct: pct(needsReviewTotal, total) },
    { kind: "⏭ 跳過（試用/單次）", count: skipTotal, pct: pct(skipTotal, total) },
  ]);

  // 單堂金額分布
  if (priceBuckets.size > 0) {
    console.log("\n=== Unit price distribution（可計算 booking 對應的單堂金額）===");
    const sorted = [...priceBuckets.entries()].sort(
      (a, b) => Number(b[0]) - Number(a[0]),
    );
    console.table(
      sorted.map(([price, b]) => ({
        unitPrice: price,
        bookings: b.count,
        clean: b.clean,
        with_adjustment_risk: b.risk,
      })),
    );
  }

  // ── Next-step guidance ──────────────────────────────────────────────
  console.log("\n=== Next-step guidance ===");
  const canCleanPct = (summary.CAN_COMPUTE_CLEAN / total) * 100;
  const riskPct = (summary.CAN_COMPUTE_WITH_RISK / total) * 100;
  const reviewPct = (needsReviewTotal / total) * 100;

  if (reviewPct >= 10) {
    console.log(
      `🔴 需人工確認比例 ${reviewPct.toFixed(1)}% — 太高，PR-2.2 修 UI 前應先處理：`,
    );
    console.log("    NO_WALLET / NO_PRICE / NO_SESSIONS 的 booking 個案 → 看是否需 backfill");
    console.log("    or 標記永久「歸店家」(金額 0)");
  } else if (riskPct >= 10) {
    console.log(
      `⚠️ ${riskPct.toFixed(1)}% booking 對應的 wallet 曾被 amount=0 ADJUSTMENT，可能漏算贈送堂。`,
    );
    console.log("    建議：");
    console.log(
      "      a) 先用 SQL / 額外 audit 抽樣 5–10 筆，人工核對 wallet.totalSessions 是否真的少了贈送堂",
    );
    console.log("      b) 若確認有問題，Phase 2 加 bonusSessions 欄位 + 補資料");
    console.log("      c) PR-2.2 UI 對 CAN_COMPUTE_WITH_RISK 加 ⚠️ 標籤");
  } else if (canCleanPct >= 80) {
    console.log(
      `✓ 可乾淨計算比例 ${canCleanPct.toFixed(1)}% — PR-2.2 可進行金額邏輯改寫。`,
    );
  } else {
    console.log(
      `ℹ️ 可計算比例 ${(canCleanPct + riskPct).toFixed(1)}%，需人工確認 ${reviewPct.toFixed(1)}%。`,
    );
    console.log("    建議仔細看明細分類，決定哪些先處理。");
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nFatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
