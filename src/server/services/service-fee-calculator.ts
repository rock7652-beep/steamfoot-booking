import { prisma } from "@/lib/db";
import { bookingMonthRange, monthRange, toLocalMonthStr } from "@/lib/date-utils";
import {
  REVENUE_TRANSACTION_TYPES,
  REVENUE_VALID_STATUS,
} from "@/lib/booking-constants";

export interface ServiceFeeCalculatorInput {
  storeId?: string | null;
  /** YYYY-MM. Defaults to the current Taipei month. */
  month?: string;
}

export interface ServiceFeeCalculatorSummary {
  month: string;
  storeId: string | null;
  storeName: string;
  range: {
    startDate: string;
    endDate: string;
    transactionStart: Date;
    transactionEnd: Date;
  };
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  revenueTransactionCount: number;
  refundTransactionCount: number;
}

export interface ServiceFeeCalculatorAdjustments {
  fixedMonthlyFee: number;
  revenueSharePercent: number;
  additionalAmount: number;
  deductionAmount: number;
}

export interface ServiceFeeSettlementCalculation extends ServiceFeeCalculatorAdjustments {
  revenueShareAmount: number;
  receivableAmount: number;
}

const PAID_PAYMENT_STATUSES = ["SUCCESS", "CONFIRMED"] as const;

function storeWhere(storeId?: string | null) {
  return storeId ? { storeId } : {};
}

function money(value: unknown): number {
  return Number(value ?? 0);
}

function resolveMonthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const transactionRange = monthRange(month);
  const bookingRange = bookingMonthRange(year, mon);
  return {
    startDate: `${month}-01`,
    endDate: bookingRange.end.toISOString().slice(0, 10),
    transactionStart: transactionRange.start,
    transactionEnd: transactionRange.end,
  };
}

export async function getServiceFeeCalculatorSummary(
  input: ServiceFeeCalculatorInput = {},
): Promise<ServiceFeeCalculatorSummary> {
  const month = input.month ?? toLocalMonthStr();
  const range = resolveMonthRange(month);

  const [revenue, refunds, store] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        ...storeWhere(input.storeId),
        transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
        status: REVENUE_VALID_STATUS,
        paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
        transactionDate: { gte: range.transactionStart, lte: range.transactionEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...storeWhere(input.storeId),
        transactionType: "REFUND",
        status: REVENUE_VALID_STATUS,
        paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
        transactionDate: { gte: range.transactionStart, lte: range.transactionEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    input.storeId
      ? prisma.store.findUnique({
          where: { id: input.storeId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const grossRevenue = money(revenue._sum.amount);
  const refundAmount = Math.abs(money(refunds._sum.amount));

  return {
    month,
    storeId: input.storeId ?? null,
    storeName: input.storeId ? (store?.name ?? "目前店舖") : "全部店舖",
    range,
    grossRevenue,
    refundAmount,
    netRevenue: grossRevenue - refundAmount,
    revenueTransactionCount: revenue._count.id,
    refundTransactionCount: refunds._count.id,
  };
}

export function calculateServiceFeeSettlement(
  summary: Pick<ServiceFeeCalculatorSummary, "netRevenue">,
  adjustments: ServiceFeeCalculatorAdjustments,
): ServiceFeeSettlementCalculation {
  const revenueShareAmount = Math.round(
    summary.netRevenue * (adjustments.revenueSharePercent / 100),
  );
  const receivableAmount =
    summary.netRevenue -
    revenueShareAmount +
    adjustments.fixedMonthlyFee +
    adjustments.additionalAmount -
    adjustments.deductionAmount;

  return {
    ...adjustments,
    revenueShareAmount,
    receivableAmount,
  };
}
