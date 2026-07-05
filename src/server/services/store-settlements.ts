import type { StoreSettlementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { calculateServiceFeeSettlement } from "@/server/services/service-fee-calculator";

export const STORE_SETTLEMENT_CONFIRMED_LOCK_MESSAGE =
  "此月結已確認，若需修改請先解除確認";

export interface StoreSettlementInput {
  month: string;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  transactionCount: number;
  fixedMonthlyFee: number;
  revenueShareRate: number;
  additionalAmount: number;
  deductionAmount: number;
  note?: string | null;
  status?: StoreSettlementStatus;
}

export interface StoreSettlementRecord {
  id: string;
  storeId: string;
  storeName: string;
  month: string;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  transactionCount: number;
  fixedMonthlyFee: number;
  revenueShareRate: number;
  revenueShareAmount: number;
  additionalAmount: number;
  deductionAmount: number;
  finalReceivable: number;
  note: string | null;
  status: StoreSettlementStatus;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(
  settlement: {
    id: string;
    storeId: string;
    month: string;
    grossRevenue: number;
    refundAmount: number;
    netRevenue: number;
    transactionCount: number;
    fixedMonthlyFee: number;
    revenueShareRate: unknown;
    revenueShareAmount: number;
    additionalAmount: number;
    deductionAmount: number;
    finalReceivable: number;
    note: string | null;
    status: StoreSettlementStatus;
    createdAt: Date;
    updatedAt: Date;
    store?: { name: string } | null;
  },
): StoreSettlementRecord {
  return {
    id: settlement.id,
    storeId: settlement.storeId,
    storeName: settlement.store?.name ?? "目前店舖",
    month: settlement.month,
    grossRevenue: settlement.grossRevenue,
    refundAmount: settlement.refundAmount,
    netRevenue: settlement.netRevenue,
    transactionCount: settlement.transactionCount,
    fixedMonthlyFee: settlement.fixedMonthlyFee,
    revenueShareRate: Number(settlement.revenueShareRate ?? 0),
    revenueShareAmount: settlement.revenueShareAmount,
    additionalAmount: settlement.additionalAmount,
    deductionAmount: settlement.deductionAmount,
    finalReceivable: settlement.finalReceivable,
    note: settlement.note,
    status: settlement.status,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
  };
}

export function calculateStoreSettlementAmounts(input: StoreSettlementInput) {
  const calculation = calculateServiceFeeSettlement(
    { netRevenue: input.netRevenue },
    {
      fixedMonthlyFee: input.fixedMonthlyFee,
      revenueSharePercent: input.revenueShareRate,
      additionalAmount: input.additionalAmount,
      deductionAmount: input.deductionAmount,
    },
  );

  return {
    revenueShareAmount: calculation.revenueShareAmount,
    finalReceivable: calculation.receivableAmount,
  };
}

export async function saveStoreSettlementForStore({
  storeId,
  userId,
  input,
}: {
  storeId: string;
  userId?: string | null;
  input: StoreSettlementInput;
}): Promise<StoreSettlementRecord> {
  const existing = await prisma.storeSettlement.findUnique({
    where: {
      uq_store_settlement_store_month: {
        storeId,
        month: input.month,
      },
    },
    select: { status: true },
  });
  if (existing?.status === "CONFIRMED") {
    throw new AppError("FORBIDDEN", STORE_SETTLEMENT_CONFIRMED_LOCK_MESSAGE);
  }

  const amounts = calculateStoreSettlementAmounts(input);
  const settlement = await prisma.storeSettlement.upsert({
    where: {
      uq_store_settlement_store_month: {
        storeId,
        month: input.month,
      },
    },
    create: {
      storeId,
      month: input.month,
      grossRevenue: input.grossRevenue,
      refundAmount: input.refundAmount,
      netRevenue: input.netRevenue,
      transactionCount: input.transactionCount,
      fixedMonthlyFee: input.fixedMonthlyFee,
      revenueShareRate: input.revenueShareRate,
      revenueShareAmount: amounts.revenueShareAmount,
      additionalAmount: input.additionalAmount,
      deductionAmount: input.deductionAmount,
      finalReceivable: amounts.finalReceivable,
      note: input.note?.trim() || null,
      status: "DRAFT",
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    },
    update: {
      grossRevenue: input.grossRevenue,
      refundAmount: input.refundAmount,
      netRevenue: input.netRevenue,
      transactionCount: input.transactionCount,
      fixedMonthlyFee: input.fixedMonthlyFee,
      revenueShareRate: input.revenueShareRate,
      revenueShareAmount: amounts.revenueShareAmount,
      additionalAmount: input.additionalAmount,
      deductionAmount: input.deductionAmount,
      finalReceivable: amounts.finalReceivable,
      note: input.note?.trim() || null,
      status: "DRAFT",
      updatedBy: userId ?? null,
    },
    include: { store: { select: { name: true } } },
  });

  return toRecord(settlement);
}

export async function getStoreSettlementsForStore(
  storeId: string,
  limit = 12,
): Promise<StoreSettlementRecord[]> {
  const settlements = await prisma.storeSettlement.findMany({
    where: { storeId },
    orderBy: [{ month: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: { store: { select: { name: true } } },
  });
  return settlements.map(toRecord);
}

export async function getStoreSettlementForStoreByMonth(
  storeId: string,
  month: string,
): Promise<StoreSettlementRecord | null> {
  const settlement = await prisma.storeSettlement.findUnique({
    where: {
      uq_store_settlement_store_month: {
        storeId,
        month,
      },
    },
    include: { store: { select: { name: true } } },
  });
  return settlement ? toRecord(settlement) : null;
}

export async function confirmStoreSettlementForStore({
  storeId,
  month,
  userId,
}: {
  storeId: string;
  month: string;
  userId?: string | null;
}): Promise<StoreSettlementRecord> {
  const settlement = await prisma.storeSettlement.update({
    where: {
      uq_store_settlement_store_month: {
        storeId,
        month,
      },
    },
    data: {
      status: "CONFIRMED",
      updatedBy: userId ?? null,
    },
    include: { store: { select: { name: true } } },
  });
  return toRecord(settlement);
}

export async function reopenStoreSettlementForStore({
  storeId,
  month,
  userId,
}: {
  storeId: string;
  month: string;
  userId?: string | null;
}): Promise<StoreSettlementRecord> {
  const settlement = await prisma.storeSettlement.update({
    where: {
      uq_store_settlement_store_month: {
        storeId,
        month,
      },
    },
    data: {
      status: "DRAFT",
      updatedBy: userId ?? null,
    },
    include: { store: { select: { name: true } } },
  });
  return toRecord(settlement);
}
