/**
 * Transaction Snapshot Helper
 *
 * 建立交易時寫入快照欄位，確保報表資料不因後續變更而改變。
 * 歸屬鎖定：教練、店名、方案等快照一旦寫入即不可覆蓋。
 */

import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import type { Prisma } from "@prisma/client";

// 用於 prisma.$transaction 內傳入的 tx client
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface SnapshotParams {
  customerId: string;
  storeId: string;
  revenueStaffId: string;
  planId?: string | null;
  grossAmount: number;
  netAmount: number;
}

interface SnapshotFields {
  transactionNo: string;
  transactionDate: Date;
  status: "SUCCESS";
  coachNameSnapshot: string | null;
  coachRoleSnapshot: string | null;
  storeNameSnapshot: string | null;
  planId: string | null;
  planNameSnapshot: string | null;
  planType: string | null;
  grossAmount: Prisma.Decimal | number;
  discountAmount: Prisma.Decimal | number;
  netAmount: Prisma.Decimal | number;
  isFirstPurchase: boolean;
}

/**
 * 產生交易編號 TXN-YYYYMMDD-NNN（per store 當日遞增）
 */
async function generateTransactionNo(
  tx: TxClient,
  storeId: string,
  dateStr: string
): Promise<string> {
  const prefix = `TXN-${dateStr.replace(/-/g, "")}`;

  // 查詢該店當日最大交易編號
  const lastTx = await tx.transaction.findFirst({
    where: {
      storeId,
      transactionNo: { startsWith: prefix },
    },
    orderBy: { transactionNo: "desc" },
    select: { transactionNo: true },
  });

  let seq = 1;
  if (lastTx?.transactionNo) {
    const lastSeq = parseInt(lastTx.transactionNo.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/**
 * 建立交易快照欄位
 *
 * 在 prisma.$transaction 內呼叫，傳入 tx client。
 * 查詢教練、店名、方案資訊，判斷新客，產生交易編號。
 */
export async function buildTransactionSnapshot(
  tx: TxClient,
  params: SnapshotParams
): Promise<SnapshotFields> {
  const { customerId, storeId, revenueStaffId, planId, grossAmount, netAmount } = params;

  // 並行查詢
  const [staff, store, plan, existingTxCount] = await Promise.all([
    tx.staff.findUnique({
      where: { id: revenueStaffId },
      select: { displayName: true, user: { select: { role: true } } },
    }),
    tx.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    }),
    planId
      ? tx.servicePlan.findUnique({
          where: { id: planId },
          select: { name: true, category: true },
        })
      : null,
    // 查詢該客戶是否有任何成功的購買交易
    tx.transaction.count({
      where: {
        customerId,
        status: "SUCCESS",
        transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE"] },
      },
    }),
  ]);

  const dateStr = toLocalDateStr();
  const transactionNo = await generateTransactionNo(tx, storeId, dateStr);

  const discountAmount = Math.max(0, grossAmount - netAmount);

  return {
    transactionNo,
    transactionDate: new Date(),
    status: "SUCCESS",
    coachNameSnapshot: staff?.displayName ?? null,
    coachRoleSnapshot: staff?.user?.role ?? null,
    storeNameSnapshot: store?.name ?? null,
    planId: planId ?? null,
    planNameSnapshot: plan?.name ?? null,
    planType: plan?.category ?? null,
    grossAmount,
    discountAmount,
    netAmount,
    isFirstPurchase: existingTxCount === 0,
  };
}

/**
 * 為退款交易建立快照（繼承原交易的快照欄位）
 */
export function buildRefundSnapshot(originalTx: {
  coachNameSnapshot: string | null;
  coachRoleSnapshot: string | null;
  storeNameSnapshot: string | null;
  planId: string | null;
  planNameSnapshot: string | null;
  planType: string | null;
}) {
  return {
    transactionDate: new Date(),
    status: "REFUNDED" as const,
    coachNameSnapshot: originalTx.coachNameSnapshot,
    coachRoleSnapshot: originalTx.coachRoleSnapshot,
    storeNameSnapshot: originalTx.storeNameSnapshot,
    planId: originalTx.planId,
    planNameSnapshot: originalTx.planNameSnapshot,
    planType: originalTx.planType,
    grossAmount: 0,
    discountAmount: 0,
    netAmount: 0,
    isFirstPurchase: false,
  };
}
