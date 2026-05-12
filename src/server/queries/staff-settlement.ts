/**
 * staff-settlement — 店長服務金額試算（PR-2.2 攤提版）
 *
 * 從 PR-2 的「fee × count」改寫成依方案攤提：
 *
 *   方案單堂金額 = 顧客方案實收金額 ÷ 總可使用堂數
 *
 * 每筆 COMPLETED booking 的金額決策樹（對應 docs/staff-settlement-phase1-spec.md §3.7）：
 *
 *   walletId = booking.customerPlanWalletId
 *            ?? booking.makeupCredit.originalBooking.customerPlanWalletId
 *
 *   walletId === null：
 *     - FIRST_TRIAL  → amount=0,    source=trial_no_wallet
 *     - SINGLE       → amount=0,    source=single_no_wallet
 *     - PACKAGE_SESSION → amount=null, source=missing_wallet, needsReview=true
 *
 *   walletId 存在：
 *     override = getOverrideForWallet(walletId)
 *
 *     override.decision === "EXCLUDE_FROM_SETTLEMENT":
 *       amount=null, source=operator_excluded, needsReview=true
 *
 *     override.decision === "OVERRIDE_TOTAL":
 *       amount = override.overrideUnitPrice
 *       source = override
 *
 *     override.decision === "CONFIRM_AS_IS":
 *       若 wallet.purchasedPrice > 0 AND wallet.totalSessions > 0:
 *         amount = wallet.purchasedPrice / wallet.totalSessions
 *         source = formula_confirmed
 *       否則:
 *         amount=null, source=confirmed_but_data_missing, needsReview=true
 *
 *     override === null (沒被 operator review)：
 *       若 wallet 有 ADJUSTMENT transaction:
 *         amount=null, source=needs_operator_review, needsReview=true
 *         （保守預設：未經 review 的 risk wallet 不硬算）
 *       否則:
 *         若 wallet.purchasedPrice > 0 AND wallet.totalSessions > 0:
 *           amount = wallet.purchasedPrice / wallet.totalSessions
 *           source = formula_clean
 *         否則:
 *           amount=null, source=data_missing, needsReview=true
 *
 * 純讀取查詢，不寫入任何資料。
 * 安全：沿用 getManagerReadFilter，PARTNER SELF_ONLY 不被 URL staffId 覆蓋。
 * 不引入 resolveCustomerStaffAssignment（PR-1.5a 鎖定的禁止項）。
 */

import { BookingType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getManagerReadFilter } from "@/lib/manager-visibility";
import { getOverrideForWallet } from "@/server/services/settlement-overrides";

export const UNASSIGNED_STAFF_TOKEN = "__unassigned__";

export type AmountSource =
  | "formula_clean" //  無 override 也無 ADJUSTMENT，用公式
  | "formula_confirmed" //  override CONFIRM_AS_IS 用公式
  | "override" //  override OVERRIDE_TOTAL 用指定 unit price
  | "operator_excluded" //  override EXCLUDE_FROM_SETTLEMENT
  | "trial_no_wallet" //  FIRST_TRIAL 無 wallet（預期）
  | "single_no_wallet" //  SINGLE 無 wallet（業務常態）
  | "missing_wallet" //  PACKAGE_SESSION 但無 wallet（資料異常）
  | "needs_operator_review" //  有 ADJUSTMENT 但沒在 override JSON
  | "data_missing" //  wallet 存在但 purchasedPrice/totalSessions 不正常
  | "confirmed_but_data_missing"; //  CONFIRM_AS_IS 但 wallet 數據異常

export interface SettlementSummaryRow {
  staffId: string | null;
  staffName: string;
  regularCount: number;
  makeupCount: number;
  totalCount: number;
  countedAmount: number;
  needsReviewCount: number;
}

export interface SettlementDetailRow {
  bookingId: string;
  bookingDate: Date;
  slotTime: string;
  customerName: string;
  bookingType: BookingType;
  isMakeup: boolean;
  revenueStaffId: string | null;
  revenueStaffName: string;
  serviceStaffId: string | null;
  serviceStaffName: string;
  walletId: string | null;
  amount: number | null;
  amountSource: AmountSource;
  needsReview: boolean;
  /** booking 是否計入店長金額（amount > 0 且 revenueStaffId !== null） */
  counted: boolean;
}

export interface PreviewStaffSettlementInput {
  startDate: string;
  endDate: string;
  staffId?: string;
  activeStoreId?: string | null;
}

export interface PreviewStaffSettlementResult {
  summary: SettlementSummaryRow[];
  details: SettlementDetailRow[];
}

// ── 核心：給定 wallet info → 算 amount + source ────────────────────────

interface WalletForCalc {
  id: string;
  purchasedPrice: number;
  totalSessions: number;
  hasAdjustment: boolean;
}

function classifyByWallet(
  wallet: WalletForCalc,
): { amount: number | null; source: AmountSource; needsReview: boolean } {
  const override = getOverrideForWallet(wallet.id);

  if (override) {
    if (override.decision === "EXCLUDE_FROM_SETTLEMENT") {
      return { amount: null, source: "operator_excluded", needsReview: true };
    }
    if (override.decision === "OVERRIDE_TOTAL") {
      return {
        amount: override.overrideUnitPrice ?? null,
        source: "override",
        needsReview: false,
      };
    }
    // CONFIRM_AS_IS
    if (wallet.purchasedPrice > 0 && wallet.totalSessions > 0) {
      return {
        amount: wallet.purchasedPrice / wallet.totalSessions,
        source: "formula_confirmed",
        needsReview: false,
      };
    }
    return {
      amount: null,
      source: "confirmed_but_data_missing",
      needsReview: true,
    };
  }

  // 無 override
  if (wallet.hasAdjustment) {
    return { amount: null, source: "needs_operator_review", needsReview: true };
  }
  if (wallet.purchasedPrice > 0 && wallet.totalSessions > 0) {
    return {
      amount: wallet.purchasedPrice / wallet.totalSessions,
      source: "formula_clean",
      needsReview: false,
    };
  }
  return { amount: null, source: "data_missing", needsReview: true };
}

// ── Main ──────────────────────────────────────────────────────────────────

export async function previewStaffSettlement(
  input: PreviewStaffSettlementInput,
): Promise<PreviewStaffSettlementResult> {
  const user = await requireStaffSession();

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T23:59:59.999Z`);

  const baseFilter = getManagerReadFilter(
    user.role,
    user.staffId ?? null,
    "revenueStaffId",
    input.activeStoreId ?? user.storeId,
  );

  const where: Record<string, unknown> = {
    ...baseFilter,
    bookingStatus: "COMPLETED",
    bookingDate: { gte: start, lte: end },
  };

  // staffId 篩選（PARTNER 的 manager filter 不可被覆蓋，防 URL 篡改）
  if (input.staffId !== undefined && !("revenueStaffId" in baseFilter)) {
    if (input.staffId === UNASSIGNED_STAFF_TOKEN) {
      where.revenueStaffId = null;
    } else {
      where.revenueStaffId = input.staffId;
    }
  }

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      bookingDate: true,
      slotTime: true,
      bookingType: true,
      isMakeup: true,
      revenueStaffId: true,
      serviceStaffId: true,
      customerPlanWalletId: true,
      customer: { select: { name: true } },
      revenueStaff: { select: { id: true, displayName: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      customerPlanWallet: {
        select: {
          id: true,
          purchasedPrice: true,
          totalSessions: true,
          transactions: {
            where: { transactionType: "ADJUSTMENT" },
            select: { id: true },
            take: 1, // 只需知道「有沒有」
          },
        },
      },
      makeupCredit: {
        select: {
          originalBooking: {
            select: {
              customerPlanWalletId: true,
              customerPlanWallet: {
                select: {
                  id: true,
                  purchasedPrice: true,
                  totalSessions: true,
                  transactions: {
                    where: { transactionType: "ADJUSTMENT" },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });

  // ── Build details with amount + source ────────────────────────────
  const details: SettlementDetailRow[] = bookings.map((b) => {
    // 解 wallet（直接 or 透過 makeup）
    let walletForCalc: WalletForCalc | null = null;
    const directWallet = b.customerPlanWallet;
    if (directWallet) {
      walletForCalc = {
        id: directWallet.id,
        purchasedPrice: Number(directWallet.purchasedPrice.toString()),
        totalSessions: directWallet.totalSessions,
        hasAdjustment: directWallet.transactions.length > 0,
      };
    } else if (b.isMakeup) {
      const origWallet = b.makeupCredit?.originalBooking?.customerPlanWallet;
      if (origWallet) {
        walletForCalc = {
          id: origWallet.id,
          purchasedPrice: Number(origWallet.purchasedPrice.toString()),
          totalSessions: origWallet.totalSessions,
          hasAdjustment: origWallet.transactions.length > 0,
        };
      }
    }

    // 決定 amount + source
    let amount: number | null;
    let amountSource: AmountSource;
    let needsReview: boolean;

    if (walletForCalc === null) {
      // 沒 wallet
      switch (b.bookingType) {
        case "FIRST_TRIAL":
          amount = 0;
          amountSource = "trial_no_wallet";
          needsReview = false;
          break;
        case "SINGLE":
          amount = 0;
          amountSource = "single_no_wallet";
          needsReview = false;
          break;
        default:
          // PACKAGE_SESSION 沒 wallet → 資料異常
          amount = null;
          amountSource = "missing_wallet";
          needsReview = true;
      }
    } else {
      const c = classifyByWallet(walletForCalc);
      amount = c.amount;
      amountSource = c.source;
      needsReview = c.needsReview;
    }

    const counted = amount !== null && amount > 0 && b.revenueStaffId !== null;

    return {
      bookingId: b.id,
      bookingDate: b.bookingDate,
      slotTime: b.slotTime,
      customerName: b.customer.name,
      bookingType: b.bookingType,
      isMakeup: b.isMakeup,
      revenueStaffId: b.revenueStaffId,
      revenueStaffName: b.revenueStaff?.displayName ?? "(歸店家)",
      serviceStaffId: b.serviceStaffId,
      serviceStaffName: b.serviceStaff?.displayName ?? "—",
      walletId: walletForCalc?.id ?? null,
      amount,
      amountSource,
      needsReview,
      counted,
    };
  });

  // ── Summary：groupBy revenueStaffId ────────────────────────────────
  const summaryMap = new Map<string | null, SettlementSummaryRow>();
  for (const d of details) {
    const key = d.revenueStaffId;
    let row = summaryMap.get(key);
    if (!row) {
      row = {
        staffId: key,
        staffName: d.revenueStaffName,
        regularCount: 0,
        makeupCount: 0,
        totalCount: 0,
        countedAmount: 0,
        needsReviewCount: 0,
      };
      summaryMap.set(key, row);
    }
    if (d.isMakeup) row.makeupCount++;
    else row.regularCount++;
    row.totalCount++;
    if (d.counted && d.amount !== null) {
      row.countedAmount += d.amount;
    }
    if (d.needsReview) row.needsReviewCount++;
  }

  // 排序：店長依 countedAmount desc → 歸店家最下
  const summary: SettlementSummaryRow[] = [...summaryMap.values()].sort(
    (a, b) => {
      if (a.staffId === null && b.staffId !== null) return 1;
      if (b.staffId === null && a.staffId !== null) return -1;
      return b.countedAmount - a.countedAmount;
    },
  );

  return { summary, details };
}
