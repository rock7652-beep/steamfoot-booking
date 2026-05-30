"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getBookingDetail } from "@/server/queries/booking";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { getTrialSettings } from "@/lib/shop-config";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";

export interface BookingDrawerPayload {
  booking: {
    id: string;
    bookingDate: string;
    slotTime: string;
    bookingStatus: string;
    bookingType: string;
    people: number;
    isMakeup: boolean;
    isCheckedIn: boolean;
    notes: string | null;
    customer: {
      id: string;
      name: string;
      phone: string;
    };
    revenueStaff: {
      id: string;
      displayName: string;
      colorCode: string;
    } | null;
    serviceStaff: {
      id: string;
      displayName: string;
    } | null;
    servicePlan: {
      id: string;
      name: string;
      price: number;
      sessionCount: number;
      category: string;
    } | null;
    customerPlanWallet: {
      id: string;
      remainingSessions: number;
      totalSessions: number;
      expiryDate: string | null;
      plan: { name: string };
    } | null;
    // 體驗 499 PR-3：建立時的預計收款金額快照（僅 FIRST_TRIAL 有值）
    expectedAmount: number | null;
  };
  customerSummary: {
    totalBookings: number;
    lastVisit: string | null;
    isNewCustomer: boolean;
  };
  // 體驗 499 PR-3：僅 FIRST_TRIAL 預約有此區塊（其他型別一律 null）。
  // collected=true → 已建立 TRIAL_PURCHASE SUCCESS 交易；settings 供收款
  // Modal 決定金額是否可編輯 / 上下限。
  trial: {
    collected: boolean;
    collectedAmount: number | null;
    collectedMethod: string | null;
    collectedAt: string | null;
    // 體驗 499 PR-3b：收款更正用 —— 原 SUCCESS 交易 id + 操作者是否可更正
    collectedTransactionId: string | null;
    canCorrect: boolean;
    settings: {
      allowEdit: boolean;
      defaultPrice: number;
      minPrice: number;
      maxPrice: number;
    };
  } | null;
  // 單次（SINGLE，不扣堂）：僅 SINGLE 預約有此區塊（其他型別一律 null）。
  // collected=true → 已建立 SINGLE_PURCHASE SUCCESS 交易；defaultPrice 來自
  // booking.servicePlan?.price ?? 799（與 collectSinglePayment 同源），給
  // 收款 Modal 顯示原價 + 折扣計算用。
  single: {
    collected: boolean;
    collectedAmount: number | null;
    collectedOriginalAmount: number | null;
    collectedDiscountAmount: number | null;
    collectedMethod: string | null;
    collectedAt: string | null;
    defaultPrice: number;
  } | null;
  // 調整結帳方式（Phase 1 — 僅 SINGLE 未收款 → PACKAGE_SESSION 扣方案）。
  // 僅 SINGLE 預約有此區塊（其他型別一律 null）。canAdjustToPackage=true 時
  // Drawer 才顯示「調整結帳」按鈕；false 時 reason 給不可調整原因（已收款 /
  // 狀態不符 / 補課 / 顧客無可用方案）。wallets 為 FEFO 排序後的候選方案，
  // 第一張 recommended=true（與配堂預設一致）。
  checkout: {
    canAdjustToPackage: boolean;
    reason: string | null;
    wallets: {
      id: string;
      planName: string;
      remainingSessions: number;
      expiryDate: string | null;
      recommended: boolean;
    }[];
  } | null;
}

export async function fetchBookingDetail(
  bookingId: string,
): Promise<BookingDrawerPayload> {
  const user = await requireStaffSession();
  const booking = await getBookingDetail(bookingId);

  // 體驗 499 PR-3：僅 FIRST_TRIAL 才查收款狀態 + 體驗價設定
  const isTrial = booking.bookingType === "FIRST_TRIAL";
  const [collectedTx, trialSettings, canCorrect] = isTrial
    ? await Promise.all([
        prisma.transaction.findFirst({
          where: {
            bookingId: booking.id,
            transactionType: "TRIAL_PURCHASE",
            status: "SUCCESS",
          },
          select: { id: true, amount: true, paymentMethod: true, paidAt: true },
          orderBy: { createdAt: "desc" },
        }),
        getTrialSettings(booking.storeId),
        // 收款更正 OWNER-only：gate = transaction.void（決策 A）
        checkPermission(user.role, user.staffId, "transaction.void"),
      ])
    : [null, null, false];

  // 單次（SINGLE，不扣堂）：僅 SINGLE 才查收款狀態。取 grossAmount / discountAmount
  // 供 Drawer 顯示「原價 / 實收 / 折扣」三段，與 collectSinglePayment 寫入欄位一致。
  const isSingle = booking.bookingType === "SINGLE";
  const collectedSingleTx = isSingle
    ? await prisma.transaction.findFirst({
        where: {
          bookingId: booking.id,
          transactionType: "SINGLE_PURCHASE",
          status: "SUCCESS",
        },
        select: {
          id: true,
          amount: true,
          grossAmount: true,
          discountAmount: true,
          paymentMethod: true,
          paidAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // 調整結帳方式：僅 SINGLE 才查顧客當下可用方案（ACTIVE + 有剩餘堂）。
  // 候選與 adjustCheckoutToPackage 一致，FEFO 排序供 Drawer 顯示與預選。
  const adjustWallets =
    isSingle && !booking.isMakeup
      ? await prisma.customerPlanWallet.findMany({
          where: {
            customerId: booking.customerId,
            storeId: booking.storeId,
            status: "ACTIVE",
            remainingSessions: { gt: 0 },
          },
          select: {
            id: true,
            expiryDate: true,
            createdAt: true,
            remainingSessions: true,
            plan: { select: { name: true } },
          },
        })
      : [];

  // 顧客近況：累積完成 + 最近到店 + 是否新客 — 三查詢並行
  const storeFilter = getStoreFilter(user);
  const [completedAgg, lastVisit, firstBookingCount] = await Promise.all([
    prisma.booking.count({
      where: {
        customerId: booking.customerId,
        bookingStatus: "COMPLETED",
        ...storeFilter,
      },
    }),
    prisma.booking.findFirst({
      where: {
        customerId: booking.customerId,
        bookingStatus: "COMPLETED",
        id: { not: bookingId },
        ...storeFilter,
      },
      select: { bookingDate: true },
      orderBy: { bookingDate: "desc" },
    }),
    prisma.booking.count({
      where: {
        customerId: booking.customerId,
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
    }),
  ]);

  return {
    booking: {
      id: booking.id,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      slotTime: booking.slotTime,
      bookingStatus: booking.bookingStatus,
      bookingType: booking.bookingType,
      people: booking.people,
      isMakeup: booking.isMakeup,
      isCheckedIn: booking.isCheckedIn,
      notes: booking.notes,
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        phone: booking.customer.phone,
      },
      revenueStaff: booking.revenueStaff
        ? {
            id: booking.revenueStaff.id,
            displayName: booking.revenueStaff.displayName,
            colorCode: booking.revenueStaff.colorCode,
          }
        : null,
      serviceStaff: booking.serviceStaff
        ? {
            id: booking.serviceStaff.id,
            displayName: booking.serviceStaff.displayName,
          }
        : null,
      servicePlan: booking.servicePlan
        ? {
            id: booking.servicePlan.id,
            name: booking.servicePlan.name,
            price: Number(booking.servicePlan.price),
            sessionCount: booking.servicePlan.sessionCount,
            category: booking.servicePlan.category,
          }
        : null,
      customerPlanWallet: booking.customerPlanWallet
        ? {
            id: booking.customerPlanWallet.id,
            remainingSessions: booking.customerPlanWallet.remainingSessions,
            totalSessions: booking.customerPlanWallet.totalSessions,
            expiryDate:
              booking.customerPlanWallet.expiryDate
                ?.toISOString()
                .slice(0, 10) ?? null,
            plan: { name: booking.customerPlanWallet.plan.name },
          }
        : null,
      expectedAmount:
        booking.expectedAmount == null
          ? null
          : Number(booking.expectedAmount),
    },
    customerSummary: {
      totalBookings: completedAgg,
      lastVisit: lastVisit
        ? lastVisit.bookingDate.toISOString().slice(0, 10)
        : null,
      isNewCustomer: firstBookingCount <= 1,
    },
    trial:
      isTrial && trialSettings
        ? {
            collected: collectedTx != null,
            collectedAmount:
              collectedTx == null ? null : Number(collectedTx.amount),
            collectedMethod: collectedTx?.paymentMethod ?? null,
            // paidAt 是 timestamp（非 DB date 欄位），UTC toISOString().slice(0,10)
            // 在 00:00-08:00 台北時間會跨日顯示成前一天。用 toLocalDateStr 換 +8。
            // 模式同 PR #166 的 single.collectedAt 修法。
            collectedAt: collectedTx?.paidAt
              ? toLocalDateStr(collectedTx.paidAt)
              : null,
            collectedTransactionId: collectedTx?.id ?? null,
            canCorrect: canCorrect === true,
            settings: {
              allowEdit: trialSettings.trialAllowPriceEdit,
              defaultPrice: trialSettings.trialDefaultPrice,
              minPrice: trialSettings.trialMinPrice,
              maxPrice: trialSettings.trialMaxPrice,
            },
          }
        : null,
    single: isSingle
      ? {
          collected: collectedSingleTx != null,
          collectedAmount:
            collectedSingleTx == null ? null : Number(collectedSingleTx.amount),
          collectedOriginalAmount:
            collectedSingleTx == null
              ? null
              : Number(collectedSingleTx.grossAmount),
          collectedDiscountAmount:
            collectedSingleTx == null
              ? null
              : Number(collectedSingleTx.discountAmount),
          collectedMethod: collectedSingleTx?.paymentMethod ?? null,
          // paidAt 是 timestamp（非 DB date 欄位），UTC toISOString().slice(0,10)
          // 在 00:00-08:00 台北時間會跨日顯示成前一天。用 toLocalDateStr 換 +8。
          collectedAt: collectedSingleTx?.paidAt
            ? toLocalDateStr(collectedSingleTx.paidAt)
            : null,
          defaultPrice:
            booking.servicePlan?.price != null
              ? Number(booking.servicePlan.price)
              : 799,
        }
      : null,
    checkout: isSingle
      ? buildCheckoutBlock({
          isMakeup: booking.isMakeup,
          bookingStatus: booking.bookingStatus,
          people: booking.people,
          alreadyCollected: collectedSingleTx != null,
          wallets: adjustWallets,
        })
      : null,
  };
}

// 調整結帳方式可行性判斷 —— 與 adjustCheckoutToPackage 的 guard 同源，
// 任一不符即 canAdjustToPackage=false 並給對應 reason（按優先序）。
function buildCheckoutBlock(args: {
  isMakeup: boolean;
  bookingStatus: string;
  people: number;
  alreadyCollected: boolean;
  wallets: {
    id: string;
    expiryDate: Date | null;
    createdAt: Date;
    remainingSessions: number;
    plan: { name: string };
  }[];
}): NonNullable<BookingDrawerPayload["checkout"]> {
  const sorted = sortWalletsByFEFO(args.wallets);
  const wallets = sorted.map((w, i) => ({
    id: w.id,
    planName: w.plan.name,
    remainingSessions: w.remainingSessions,
    expiryDate: w.expiryDate?.toISOString().slice(0, 10) ?? null,
    recommended: i === 0,
  }));

  let reason: string | null = null;
  if (args.isMakeup) {
    reason = "補課預約不適用調整結帳方式";
  } else if (
    args.bookingStatus !== "PENDING" &&
    args.bookingStatus !== "CONFIRMED"
  ) {
    reason = "僅未完成 / 未取消的預約可調整結帳方式";
  } else if (args.alreadyCollected) {
    reason = "此預約已收款，需先走收款更正流程後再調整結帳方式";
  } else if (wallets.length === 0) {
    reason = "此顧客目前沒有可用方案，無法改為扣方案";
  } else {
    const totalRemaining = sorted.reduce(
      (sum, w) => sum + w.remainingSessions,
      0,
    );
    if (totalRemaining < args.people) {
      reason = `方案總剩餘 ${totalRemaining} 堂，不足本次 ${args.people} 人預約所需堂數`;
    }
  }

  return {
    canAdjustToPackage: reason === null,
    reason,
    wallets,
  };
}
