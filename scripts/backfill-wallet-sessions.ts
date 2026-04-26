/**
 * backfill-wallet-sessions.ts — 為既有 CustomerPlanWallet 建立 WalletSession 列
 *
 * Usage:
 *   # 全量
 *   npx tsx scripts/backfill-wallet-sessions.ts                    # dry-run（全量，只印統計與 anomaly）
 *   npx tsx scripts/backfill-wallet-sessions.ts --execute          # 實際寫入（全量）
 *
 *   # 限筆數（小量驗證）
 *   npx tsx scripts/backfill-wallet-sessions.ts --limit 5          # dry-run，前 5 筆 wallet
 *   npx tsx scripts/backfill-wallet-sessions.ts --execute --limit 5
 *
 *   # 單一 wallet（最安全，先針對特定 wallet 驗證）
 *   npx tsx scripts/backfill-wallet-sessions.ts --wallet <walletId>
 *   npx tsx scripts/backfill-wallet-sessions.ts --wallet <walletId> --execute
 *
 *   # 單一顧客（該顧客所有 wallet）
 *   npx tsx scripts/backfill-wallet-sessions.ts --customer <customerId>
 *   npx tsx scripts/backfill-wallet-sessions.ts --customer <customerId> --execute
 *
 * --wallet / --customer / --limit 三選一（不可並用）
 *
 * 行為（每張 wallet 獨立 transaction，安全可重跑）：
 *   1. 跳過已有 WalletSession 的 wallet（冪等）
 *   2. 取所有非補課 booking，分為：
 *        - completedBookings = COMPLETED ∪ NO_SHOW(DEDUCTED)
 *        - activeBookings    = PENDING ∪ CONFIRMED
 *      其餘狀態 (CANCELLED / NO_SHOW(NOT_DEDUCTED)) 視同未占堂
 *   3. 配 sessionNo：
 *        sessionNo 1..k        → COMPLETED row（k = completedBookings 數，依 SESSION_DEDUCTION
 *                                tx.createdAt asc，找不到 fallback booking.updatedAt）
 *        sessionNo k+1..k+m    → RESERVED row（m = activeBookings 數，依 createdAt asc）
 *        sessionNo k+m+1..N    → AVAILABLE row（N = wallet.totalSessions）
 *   4. Anomaly 不中斷，全部 log：
 *        - completed + active > totalSessions → 多出來的 booking 被忽略
 *        - completed + active < totalSessions - remainingSessions → drift，多餘空位給 AVAILABLE
 *   5. wallet.remainingSessions 同步刷成 = AVAILABLE + RESERVED 數（路線 A：以 booking 為準）
 *
 * 前置條件：
 *   - migration 20260426_add_wallet_session 已 deploy（WalletSession 表已存在）
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes("--execute");

function parseFlagValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const raw = process.argv[idx + 1];
  if (!raw || raw.startsWith("--")) {
    console.error(`ERROR: ${flag} 需要參數（例：${flag} cmoXXXX...）`);
    process.exit(1);
  }
  return raw;
}

function parseLimit(): number | null {
  const raw = parseFlagValue("--limit");
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("ERROR: --limit 必須為正整數");
    process.exit(1);
  }
  return n;
}

interface ScopeFilter {
  label: string;
  where: Prisma.CustomerPlanWalletWhereInput;
  take?: number;
}

function resolveScope(): ScopeFilter {
  const walletId = parseFlagValue("--wallet");
  const customerId = parseFlagValue("--customer");
  const limit = parseLimit();
  const flagsUsed = [
    walletId ? "--wallet" : null,
    customerId ? "--customer" : null,
    limit !== null ? "--limit" : null,
  ].filter(Boolean) as string[];

  if (flagsUsed.length > 1) {
    console.error(`ERROR: ${flagsUsed.join(" / ")} 不可並用，請只擇一`);
    process.exit(1);
  }

  if (walletId) return { label: `wallet=${walletId}`, where: { id: walletId } };
  if (customerId) return { label: `customer=${customerId}`, where: { customerId } };
  if (limit !== null) return { label: `limit=${limit}`, where: {}, take: limit };
  return { label: "ALL", where: {} };
}

interface AnomalyLog {
  walletId: string;
  customerId: string;
  kind:
    | "EXISTS"
    | "OVER_BOOKED"
    | "UNDER_BOOKED"
    | "REMAINING_DRIFT"
    | "EMPTY_TOTAL";
  detail: string;
}

async function main() {
  const scope = resolveScope();
  console.log(`[backfill-wallet-sessions] mode=${DRY_RUN ? "DRY-RUN" : "EXECUTE"} scope=${scope.label}`);

  const wallets = await prisma.customerPlanWallet.findMany({
    where: scope.where,
    select: {
      id: true,
      customerId: true,
      totalSessions: true,
      remainingSessions: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: "asc" },
    ...(scope.take ? { take: scope.take } : {}),
  });

  if (wallets.length === 0) {
    console.warn(
      `\n[WARN] 找不到符合條件的 wallet（scope=${scope.label}）。請確認 ID 正確、且 migration 已 deploy。`
    );
    return;
  }

  const stats = {
    total: wallets.length,
    skipped: 0,
    seeded: 0,
    completedRows: 0,
    reservedRows: 0,
    availableRows: 0,
    anomalies: 0,
  };
  const anomalies: AnomalyLog[] = [];

  for (const w of wallets) {
    if (w._count.sessions > 0) {
      stats.skipped += 1;
      anomalies.push({
        walletId: w.id,
        customerId: w.customerId,
        kind: "EXISTS",
        detail: `已有 ${w._count.sessions} 筆 session row，跳過`,
      });
      continue;
    }
    if (w.totalSessions <= 0) {
      stats.skipped += 1;
      anomalies.push({
        walletId: w.id,
        customerId: w.customerId,
        kind: "EMPTY_TOTAL",
        detail: `totalSessions=${w.totalSessions}，跳過`,
      });
      continue;
    }

    // 取此 wallet 的所有非補課 booking
    const bookings = await prisma.booking.findMany({
      where: { customerPlanWalletId: w.id, isMakeup: false },
      select: {
        id: true,
        bookingStatus: true,
        noShowPolicy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 找對應的 SESSION_DEDUCTION tx 取 completedAt（更精確）
    const deductionTxs = await prisma.transaction.findMany({
      where: {
        customerPlanWalletId: w.id,
        transactionType: "SESSION_DEDUCTION",
      },
      select: { bookingId: true, createdAt: true },
    });
    const deductedAtMap = new Map<string, Date>();
    for (const tx of deductionTxs) {
      if (tx.bookingId) deductedAtMap.set(tx.bookingId, tx.createdAt);
    }

    const completedBookings = bookings
      .filter(
        (b) =>
          b.bookingStatus === "COMPLETED" ||
          (b.bookingStatus === "NO_SHOW" && b.noShowPolicy === "DEDUCTED")
      )
      .sort((a, b) => {
        const ta = deductedAtMap.get(a.id)?.getTime() ?? a.updatedAt.getTime();
        const tb = deductedAtMap.get(b.id)?.getTime() ?? b.updatedAt.getTime();
        return ta - tb;
      });

    const activeBookings = bookings
      .filter((b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let completedToCreate = completedBookings;
    let activeToCreate = activeBookings;

    if (completedBookings.length + activeBookings.length > w.totalSessions) {
      anomalies.push({
        walletId: w.id,
        customerId: w.customerId,
        kind: "OVER_BOOKED",
        detail: `completed=${completedBookings.length} + active=${activeBookings.length} > totalSessions=${w.totalSessions}`,
      });
      // 截斷：completed 優先，剩餘給 active
      completedToCreate = completedBookings.slice(0, w.totalSessions);
      const activeBudget = Math.max(0, w.totalSessions - completedToCreate.length);
      activeToCreate = activeBookings.slice(0, activeBudget);
    }

    const k = completedToCreate.length;
    const m = activeToCreate.length;
    const availableCount = Math.max(0, w.totalSessions - k - m);

    const expectedRemaining = availableCount + m; // = AVAILABLE + RESERVED
    if (expectedRemaining !== w.remainingSessions) {
      anomalies.push({
        walletId: w.id,
        customerId: w.customerId,
        kind: "REMAINING_DRIFT",
        detail: `wallet.remainingSessions=${w.remainingSessions} → recompute=${expectedRemaining} (will overwrite)`,
      });
    }

    // 小範圍 (≤3 wallets) 列出每張的行為細節，方便單筆驗證
    if (wallets.length <= 3) {
      console.log(`\n  wallet=${w.id} (customer=${w.customerId})`);
      console.log(
        `    totalSessions=${w.totalSessions} | OLD remaining=${w.remainingSessions} | NEW remaining=${expectedRemaining} (delta ${expectedRemaining - w.remainingSessions >= 0 ? "+" : ""}${expectedRemaining - w.remainingSessions})`
      );
      console.log(
        `    plan: COMPLETED=${k}, RESERVED=${m}, AVAILABLE=${availableCount}`
      );
    }

    if (DRY_RUN) {
      stats.completedRows += k;
      stats.reservedRows += m;
      stats.availableRows += availableCount;
      stats.seeded += 1;
      continue;
    }

    // 實際寫入：每個 wallet 獨立 transaction
    try {
      await prisma.$transaction(async (tx) => {
        const rowsToCreate: Prisma.WalletSessionCreateManyInput[] = [];
        for (let i = 0; i < completedToCreate.length; i++) {
          const b = completedToCreate[i];
          const completedAt = deductedAtMap.get(b.id) ?? b.updatedAt;
          rowsToCreate.push({
            walletId: w.id,
            sessionNo: i + 1,
            status: "COMPLETED",
            bookingId: b.id,
            completedAt,
          });
        }
        for (let i = 0; i < activeToCreate.length; i++) {
          const b = activeToCreate[i];
          rowsToCreate.push({
            walletId: w.id,
            sessionNo: k + i + 1,
            status: "RESERVED",
            bookingId: b.id,
            reservedAt: b.createdAt,
          });
        }
        for (let i = 0; i < availableCount; i++) {
          rowsToCreate.push({
            walletId: w.id,
            sessionNo: k + m + i + 1,
            status: "AVAILABLE",
          });
        }
        await tx.walletSession.createMany({ data: rowsToCreate });

        // 同步 wallet.remainingSessions
        await tx.customerPlanWallet.update({
          where: { id: w.id },
          data: { remainingSessions: expectedRemaining },
        });
      });
      stats.completedRows += k;
      stats.reservedRows += m;
      stats.availableRows += availableCount;
      stats.seeded += 1;
    } catch (e) {
      anomalies.push({
        walletId: w.id,
        customerId: w.customerId,
        kind: "REMAINING_DRIFT",
        detail: `寫入失敗：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  stats.anomalies = anomalies.length;
  console.log("\n=== Stats ===");
  console.table(stats);

  if (anomalies.length > 0) {
    console.log("\n=== Anomalies (前 50) ===");
    console.table(
      anomalies.slice(0, 50).map((a) => ({
        wallet: a.walletId.slice(-8),
        customer: a.customerId.slice(-8),
        kind: a.kind,
        detail: a.detail,
      }))
    );
    if (anomalies.length > 50) {
      console.log(`...還有 ${anomalies.length - 50} 筆未顯示`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] 沒有寫入。確認以上統計與 anomaly 後，加 --execute 重跑。");
  } else {
    console.log("\n[EXECUTE] 完成。");
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
