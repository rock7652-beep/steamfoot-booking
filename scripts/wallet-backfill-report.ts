/**
 * wallet-backfill-report.ts — 純讀取分析：列出 backfill 會改到哪些 wallet
 *
 * 用途：
 *   執行 `backfill-wallet-sessions.ts` 之前，先看「哪些顧客的剩餘堂數會變」
 *   以決定全量 execute、分批執行、或人工修。**不會寫入任何資料**。
 *
 * Usage:
 *   # 預設：只列「值得關注」的 anomaly（REMAINING_DRIFT / OVER_BOOKED / EMPTY_TOTAL）
 *   npx tsx scripts/wallet-backfill-report.ts
 *
 *   # 印 CSV（pipe to file）
 *   npx tsx scripts/wallet-backfill-report.ts --csv > report.csv
 *
 *   # 全部 wallet（含 OK / UNDER_BOOKED / EXISTS）
 *   npx tsx scripts/wallet-backfill-report.ts --all
 *
 *   # 縮小範圍
 *   npx tsx scripts/wallet-backfill-report.ts --customer <customerId>
 *   npx tsx scripts/wallet-backfill-report.ts --wallet <walletId>
 *
 * 輸出欄位：
 *   customerId, customerName, walletId, planName,
 *   currentRemaining, recomputedRemaining, delta,
 *   anomalyKind, detail
 *
 * 預設依 |delta| 由大到小排序（最值得審視的在最上）。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type AnomalyKind =
  | "OK"
  | "EXISTS"
  | "OVER_BOOKED"
  | "UNDER_BOOKED"
  | "REMAINING_DRIFT"
  | "EMPTY_TOTAL";

interface ReportRow {
  customerId: string;
  customerName: string;
  walletId: string;
  planName: string;
  currentRemaining: number;
  recomputedRemaining: number;
  delta: number; // recomputed - current
  anomalyKind: AnomalyKind;
  detail: string;
}

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

function buildScope() {
  const walletId = parseFlagValue("--wallet");
  const customerId = parseFlagValue("--customer");
  if (walletId && customerId) {
    console.error("ERROR: --wallet / --customer 不可並用");
    process.exit(1);
  }
  if (walletId) return { id: walletId };
  if (customerId) return { customerId };
  return {};
}

// CSV 欄位 escape：含 , " \n 時用雙引號包住，內部 " 改 ""
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "customerId",
  "customerName",
  "walletId",
  "planName",
  "currentRemaining",
  "recomputedRemaining",
  "delta",
  "anomalyKind",
  "detail",
] as const;

function toCsv(rows: ReportRow[]): string {
  const header = CSV_HEADERS.join(",");
  const lines = rows.map((r) =>
    [
      r.customerId,
      r.customerName,
      r.walletId,
      r.planName,
      r.currentRemaining,
      r.recomputedRemaining,
      r.delta,
      r.anomalyKind,
      r.detail,
    ]
      .map(csvField)
      .join(",")
  );
  return [header, ...lines].join("\n");
}

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const wantAll = process.argv.includes("--all");
  const scope = buildScope();

  if (!wantCsv) {
    console.error(
      `[wallet-backfill-report] scope=${JSON.stringify(scope)} all=${wantAll}`
    );
  }

  const wallets = await prisma.customerPlanWallet.findMany({
    where: scope,
    select: {
      id: true,
      customerId: true,
      totalSessions: true,
      remainingSessions: true,
      customer: { select: { name: true } },
      plan: { select: { name: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (wallets.length === 0) {
    console.error("\n[WARN] 找不到符合條件的 wallet。");
    return;
  }

  const rows: ReportRow[] = [];

  for (const w of wallets) {
    const baseRow = {
      customerId: w.customerId,
      customerName: w.customer?.name ?? "(unknown)",
      walletId: w.id,
      planName: w.plan?.name ?? "(unknown)",
      currentRemaining: w.remainingSessions,
    };

    // 已 backfill 過 → EXISTS（不重算）
    if (w._count.sessions > 0) {
      rows.push({
        ...baseRow,
        recomputedRemaining: w.remainingSessions,
        delta: 0,
        anomalyKind: "EXISTS",
        detail: `已有 ${w._count.sessions} 筆 session row，跳過`,
      });
      continue;
    }

    if (w.totalSessions <= 0) {
      rows.push({
        ...baseRow,
        recomputedRemaining: w.remainingSessions,
        delta: 0,
        anomalyKind: "EMPTY_TOTAL",
        detail: `totalSessions=${w.totalSessions}`,
      });
      continue;
    }

    // 重現 backfill-wallet-sessions.ts 的 recompute 邏輯（純讀，不寫）
    const bookings = await prisma.booking.findMany({
      where: { customerPlanWalletId: w.id, isMakeup: false },
      select: { id: true, bookingStatus: true, noShowPolicy: true },
    });
    const completedCount = bookings.filter(
      (b) =>
        b.bookingStatus === "COMPLETED" ||
        (b.bookingStatus === "NO_SHOW" && b.noShowPolicy === "DEDUCTED")
    ).length;
    const activeCount = bookings.filter(
      (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED"
    ).length;

    let truncated = false;
    let kCompleted = completedCount;
    let mActive = activeCount;
    if (kCompleted + mActive > w.totalSessions) {
      truncated = true;
      kCompleted = Math.min(kCompleted, w.totalSessions);
      mActive = Math.max(0, w.totalSessions - kCompleted);
    }
    const availableCount = Math.max(0, w.totalSessions - kCompleted - mActive);
    const recomputed = availableCount + mActive; // = AVAILABLE + RESERVED
    const delta = recomputed - w.remainingSessions;

    let kind: AnomalyKind = "OK";
    const details: string[] = [];

    if (truncated) {
      kind = "OVER_BOOKED";
      details.push(
        `completed=${completedCount} + active=${activeCount} > totalSessions=${w.totalSessions}（截斷至 totalSessions）`
      );
    }
    if (delta !== 0) {
      // OVER_BOOKED 已標出，REMAINING_DRIFT 是 delta != 0 但沒爆量的情況
      if (kind === "OK") kind = "REMAINING_DRIFT";
      details.push(`current=${w.remainingSessions} → recompute=${recomputed} (Δ ${delta >= 0 ? "+" : ""}${delta})`);
    }
    if (kind === "OK") {
      // 沒 drift 也沒超量，但若實際使用 < total，標 UNDER_BOOKED 提醒
      if (kCompleted + mActive < w.totalSessions) {
        kind = "UNDER_BOOKED";
        details.push(
          `completed=${kCompleted} + active=${mActive} < totalSessions=${w.totalSessions}（剩餘 ${availableCount} 個 AVAILABLE，正常）`
        );
      } else {
        details.push("已用滿且資料一致");
      }
    }

    rows.push({
      ...baseRow,
      recomputedRemaining: recomputed,
      delta,
      anomalyKind: kind,
      detail: details.join("；"),
    });
  }

  // 預設只看「值得關注」的；--all 顯示全部
  const concerning: AnomalyKind[] = ["REMAINING_DRIFT", "OVER_BOOKED", "EMPTY_TOTAL"];
  const filtered = wantAll ? rows : rows.filter((r) => concerning.includes(r.anomalyKind));

  // 依 |delta| 由大到小排序，最值得審視的在最上
  filtered.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (wantCsv) {
    process.stdout.write(toCsv(filtered) + "\n");
    return;
  }

  // 人類可讀模式：summary + table
  const summary = rows.reduce<Record<AnomalyKind, number>>(
    (acc, r) => {
      acc[r.anomalyKind] = (acc[r.anomalyKind] ?? 0) + 1;
      return acc;
    },
    { OK: 0, EXISTS: 0, OVER_BOOKED: 0, UNDER_BOOKED: 0, REMAINING_DRIFT: 0, EMPTY_TOTAL: 0 }
  );
  console.log(`\n=== Summary (total wallets scanned: ${rows.length}) ===`);
  console.table(summary);

  if (filtered.length === 0) {
    console.log(
      `\n沒有${wantAll ? "" : "「值得關注」的 "}wallet。${wantAll ? "" : "（加 --all 看全部）"}`
    );
    return;
  }

  console.log(
    `\n=== ${wantAll ? "All" : "Concerning"} wallets (${filtered.length}, sorted by |delta| desc) ===`
  );
  console.table(
    filtered.slice(0, 100).map((r) => ({
      customer: r.customerName,
      plan: r.planName,
      current: r.currentRemaining,
      recompute: r.recomputedRemaining,
      delta: r.delta,
      kind: r.anomalyKind,
      walletId: r.walletId.slice(-8),
    }))
  );
  if (filtered.length > 100) {
    console.log(`...還有 ${filtered.length - 100} 筆未顯示。輸出 CSV：加 --csv > report.csv`);
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
