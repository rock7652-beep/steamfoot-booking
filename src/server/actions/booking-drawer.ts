"use server";
import { resolveSingleBookingTotal } from "@/lib/single-booking-price";

import { OperationTiming } from "@/lib/operation-timing";

import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requirePermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import { getBookingDetailForUser } from "@/server/queries/booking";
import { loadIndividualCustomerVisitSummary } from "@/server/queries/booking-participant-facts";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { getTrialSettings } from "@/lib/shop-config";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

const singleTransactionSelect = {
  id: true,
  amount: true,
  grossAmount: true,
  discountAmount: true,
  paymentMethod: true,
  paidAt: true,
} as const;

/**
 * StoredValueLedgerEntry is SPA-only. A normal Steamfoot SINGLE booking must
 * never join that optional table, even when the single purchase already exists.
 */
async function findCollectedSingleTransaction(
  bookingId: string,
) {
  const where = {
    bookingId,
    transactionType: "SINGLE_PURCHASE" as const,
    status: "SUCCESS" as const,
  };

  const transaction = await prisma.transaction.findFirst({ where, select: singleTransactionSelect, orderBy: { createdAt: "desc" } });
  return transaction ? { ...transaction, storedValueLedgerEntry: null } : null;
}

export interface BookingDrawerPayload {
  participantCheckout?: {
    canCollect: boolean; canResolve: boolean;
    canSell: boolean; canDiscount: boolean;
    plans: Array<{ id: string; name: string; category: string; price: number; sessionCount: number; validityDays: number | null }>;
    settings: { allowEdit: boolean; defaultPrice: number; minPrice: number; maxPrice: number };
    slots: Array<{ id: string | null; position: number; revision: number; customerId: string | null; name: string | null;
      service: string; status: string; source?: string; collectedAmount: number | null;
      selectedWalletId?: string | null; selectedPlanName?: string | null; receiptCorrected?: boolean;
      wallets?: Array<{ id: string; name: string; available: number }> }>;
  };
  companions?: { canAdd?: boolean; canEdit: boolean; canCreate: boolean; slots: Array<{ position: number; revision: number; customerId: string | null; name: string | null; status?: string }> };
  canEditServiceNote?: boolean;
  canEditBookingNote?: boolean;
  booking: {
    id: string;
    bookingDate: string;
    slotTime: string;
    bookingStatus: string;
    bookingType: string;
    bookingSource?: string | null;
    people: number;
    isMakeup: boolean;
    isCheckedIn: boolean;
    notes: string | null;
    treatmentNameSnapshot?: string | null;
    treatmentPriceSnapshot?: number | null;
    treatmentServiceMinutesSnapshot?: number | null;
    treatmentBufferMinutesSnapshot?: number | null;
    customer: {
      id: string;
      name: string;
      phone: string;
      // 內部服務備註（後台限定）— 顧客資訊區顯示（display-only）
      notes?: string | null;
      serviceNote: string | null;
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
    makeupCreditLinks: { makeupCreditId: string }[];
    walletSessions: { id: string; status: string }[];
    // 體驗 499 PR-3：建立時的預計收款金額快照（僅 FIRST_TRIAL 有值）
    expectedAmount: number | null;
    // PR-3d：實際到店人數（FIRST_TRIAL 部分到店；null = 未記錄／全到）
    attendedPeople: number | null;
    noShowMakeupGranted?: boolean | null;
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
  // treatmentPriceSnapshot / expectedAmount / servicePlan.price / 799
  //（與 collectSinglePayment 同源），給
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
  // Monetary stored value is a payment entitlement, not a service/session plan.
  storedValue?: {
    balance: number;
    status: string;
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
  // 調整結帳方式（Phase 2 / Mode B — PACKAGE_SESSION 方案扣堂 → SINGLE 單次未收款）。
  // 僅 PACKAGE_SESSION 預約有此區塊（其他型別一律 null）。canAdjustToSingle=true 時
  // Drawer 才顯示「調整結帳」按鈕；false 時 reason 給不可調整原因（補課 / 狀態不符）。
  // 「已扣堂 / 已有 SUCCESS 交易」的權威判斷在 adjustCheckoutToSingle action 內（執行時
  // race-safe 重查），此 Drawer 區塊只負責入口呈現，不重複加查詢。
  // currentPlanName / currentRemaining 供 Modal 顯示「目前：方案扣堂｜方案名｜剩 X 堂」；
  // singleDefaultPrice 為轉換後的蒸足單次金額快照。
  checkoutToSingle: {
    canAdjustToSingle: boolean;
    reason: string | null;
    currentPlanName: string | null;
    currentRemaining: number | null;
    singleDefaultPrice: number;
  } | null;
}

async function fetchSpaBookingDetail(bookingId: string, storeId: string): Promise<BookingDrawerPayload> {
  const booking = await spaPrisma.spaBooking.findFirst({
    where: { id: bookingId, storeId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      payments: { where: { refundOfPaymentId: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!booking) throw new Error("BOOKING_NOT_FOUND");

  const [customer, staff, wallet, entitlements, completedCount, lastVisit, activeCount] = await Promise.all([
    prisma.customer.findFirst({ where: { id: booking.customerId, storeId }, select: { id: true, name: true, phone: true, serviceNote: true } }),
    prisma.staff.findMany({ where: { id: { in: [booking.serviceStaffId, ...(booking.revenueStaffId ? [booking.revenueStaffId] : [])] }, storeId }, select: { id: true, displayName: true, colorCode: true } }),
    spaPrisma.spaStoredValueWallet.findUnique({ where: { storeId_customerId: { storeId, customerId: booking.customerId } } }),
    spaPrisma.spaEntitlement.findMany({ where: { storeId, customerId: booking.customerId, status: "ACTIVE", remainingUses: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] }),
    spaPrisma.spaBooking.count({ where: { storeId, customerId: booking.customerId, status: "COMPLETED" } }),
    spaPrisma.spaBooking.findFirst({ where: { storeId, customerId: booking.customerId, status: "COMPLETED", id: { not: booking.id } }, select: { bookingDate: true }, orderBy: { bookingDate: "desc" } }),
    spaPrisma.spaBooking.count({ where: { storeId, customerId: booking.customerId, status: { in: ["PENDING", "CONFIRMED"] } } }),
  ]);
  if (!customer) throw new Error("SPA_BOOKING_CUSTOMER_NOT_FOUND");
  const serviceStaff = staff.find((person) => person.id === booking.serviceStaffId) ?? null;
  const revenueStaff = staff.find((person) => person.id === booking.revenueStaffId) ?? null;
  const payment = booking.payments[0] ?? null;
  const serviceMinutes = booking.items.reduce((sum, item) => sum + item.serviceMinutes, 0);
  const bufferMinutes = booking.items.reduce((sum, item) => sum + item.bufferMinutes, 0);
  const checkoutWallets = entitlements.map((entitlement, index) => ({
    id: entitlement.id,
    planName: entitlement.nameSnapshot,
    remainingSessions: entitlement.remainingUses,
    expiryDate: entitlement.expiryDate?.toISOString().slice(0, 10) ?? null,
    recommended: index === 0,
  }));

  return {
    booking: {
      id: booking.id,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      slotTime: booking.startTime,
      bookingStatus: booking.status,
      bookingType: "SINGLE",
      people: booking.people,
      isMakeup: false,
      isCheckedIn: booking.checkedInAt != null,
      notes: booking.notes,
      treatmentNameSnapshot: booking.serviceNameSnapshot,
      treatmentPriceSnapshot: Number(booking.totalPriceSnapshot),
      treatmentServiceMinutesSnapshot: serviceMinutes,
      treatmentBufferMinutesSnapshot: bufferMinutes,
      customer,
      revenueStaff,
      serviceStaff,
      servicePlan: null,
      customerPlanWallet: null,
      makeupCreditLinks: [],
      walletSessions: [],
      expectedAmount: Number(booking.totalPriceSnapshot),
      attendedPeople: null,
    },
    customerSummary: {
      totalBookings: completedCount,
      lastVisit: lastVisit?.bookingDate.toISOString().slice(0, 10) ?? null,
      isNewCustomer: activeCount <= 1,
    },
    trial: null,
    single: {
      collected: payment != null,
      collectedAmount: payment ? Number(payment.netAmount) : null,
      collectedOriginalAmount: payment ? Number(payment.grossAmount) : null,
      collectedDiscountAmount: payment ? Number(payment.grossAmount) - Number(payment.netAmount) : null,
      collectedMethod: payment?.paymentMethod ?? null,
      collectedAt: payment?.paidAt ? toLocalDateStr(payment.paidAt) : null,
      defaultPrice: Number(booking.totalPriceSnapshot),
    },
    storedValue: wallet ? { balance: Number(wallet.balance), status: wallet.status } : null,
    checkout: {
      canAdjustToPackage: payment == null && (booking.status === "PENDING" || booking.status === "CONFIRMED") && checkoutWallets.length > 0,
      reason: payment
        ? "此預約已完成付款"
        : checkoutWallets.length === 0
          ? "此顧客目前沒有可用療程"
          : null,
      wallets: checkoutWallets,
    },
    checkoutToSingle: null,
  };
}

export async function fetchBookingDetail(
  bookingId: string,
  resolvedStoreId?: string,
): Promise<BookingDrawerPayload> {
  // Fixed action label only; no arguments, customer data, or identifiers.
  console.info("[BOOKING_ACTION]", "fetchBookingDetail");
  const timing = new OperationTiming("booking.detail");
  try { return await fetchBookingDetailMeasured(bookingId, resolvedStoreId, timing); }
  finally { timing.finish(); }
}

async function fetchBookingDetailMeasured(
  bookingId: string, resolvedStoreId: string | undefined, timing: OperationTiming,
): Promise<BookingDrawerPayload> {
  const user = await timing.measure("session", () => requirePermission("booking.read", undefined, { storeId: resolvedStoreId }));
  // Explicit page scope is authoritative after authorization. Do not resolve
  // unused route/cookie scopes first (or let stale view cookies block it).
  const [activeStoreId, storeViewContext] = resolvedStoreId
    ? [null, null] as const
    : await Promise.all([
        timing.measure("activeStore", () => getActiveStoreForRead(user)),
        timing.measure("viewContext", () => resolveStoreViewContextFromCookie(user)),
      ]);
  const bookingStoreId = resolvedStoreId
    ? await timing.measure("explicitStore", () => validateStoreAccess(user, resolvedStoreId, "read"))
    : storeIdForViewContext(activeStoreId, storeViewContext);
  const readUser = resolvedStoreId && user.role !== "ADMIN"
    ? { ...user, storeId: resolvedStoreId }
    : userForViewContext(user, storeViewContext);
  const isViewMode = resolvedStoreId
    ? user.role !== "ADMIN" && resolvedStoreId !== user.storeId
    : storeViewContext?.isViewMode === true;
  if (
    bookingStoreId &&
    (await getStoreIndustryModule(bookingStoreId)) === "spa"
  ) {
    return fetchSpaBookingDetail(bookingId, bookingStoreId);
  }
  // 重用已解析的 staff user，避免 getBookingDetail 內再 requireSession 一次
  const booking = await timing.measure("booking", () => getBookingDetailForUser(
    bookingId,
    readUser,
    bookingStoreId,
  ));

  const isTrial = booking.bookingType === "FIRST_TRIAL";
  const isSingle = booking.bookingType === "SINGLE";
  const isPackage = booking.bookingType === "PACKAGE_SESSION";
  const storeFilter = getStoreFilter(readUser, bookingStoreId);
  const personalVisits = process.env.BOOKING_PARTICIPANTS_ENABLED === "true"
    ? loadIndividualCustomerVisitSummary(booking.storeId, booking.customerId, bookingId)
    : null;

  // 拿到 booking 後，下列查詢彼此獨立（只依賴 booking.id / storeId / customerId），
  // 一次並行避免「收款查詢 → 顧客近況查詢」串成 waterfall：
  //   - 體驗 499 PR-3：FIRST_TRIAL 收款狀態 + 體驗價設定 + 更正權限
  //   - 單次（SINGLE，不扣堂）收款狀態：grossAmount / discountAmount 供
  //     Drawer 顯示「原價 / 實收 / 折扣」，與 collectSinglePayment 寫入欄位一致
  //   - 顧客近況：累積完成 + 最近到店 + 是否新客
  const [
    collectedTx,
    trialSettings,
    canCorrect,
    collectedSingleTx,
    adjustWallets,
    completedAgg,
    lastVisit,
    firstBookingCount,
    canEditServiceNote,
    canEditBookingNote,
  ] = await timing.measure("supplementary", () => Promise.all([
    isTrial
      ? prisma.transaction.findFirst({
          where: {
            bookingId: booking.id,
            transactionType: "TRIAL_PURCHASE",
            status: "SUCCESS",
          },
          select: { id: true, amount: true, paymentMethod: true, paidAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    isTrial ? getTrialSettings(booking.storeId) : Promise.resolve(null),
    // 收款更正 OWNER-only：gate = transaction.void（決策 A）
    isTrial && !isViewMode
      ? checkPermission(user.role, user.staffId, "transaction.void")
      : Promise.resolve(false),
    // 單次（SINGLE，不扣堂）：僅 SINGLE 才查收款狀態。取 grossAmount /
    // discountAmount 供 Drawer 顯示「原價 / 實收 / 折扣」三段，與
    // collectSinglePayment 寫入欄位一致。
    isSingle
      ? findCollectedSingleTransaction(booking.id)
      : Promise.resolve(null),
    // 調整結帳方式：僅 SINGLE 且非補課才查顧客可用方案（ACTIVE + 有剩餘堂）。
    // FIRST_TRIAL / PACKAGE_SESSION / 補課一律 lazy 帶過，不必要查 wallet。
    // 候選與 adjustCheckoutToPackage 一致，FEFO 排序在 buildCheckoutBlock 內做。
    isSingle && !booking.isMakeup
      ? prisma.customerPlanWallet.findMany({
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
      : Promise.resolve([]),
    personalVisits ? personalVisits.then(summary => summary.totalBookings) : prisma.booking.count({
      where: {
        customerId: booking.customerId,
        bookingStatus: "COMPLETED",
        ...storeFilter,
      },
    }),
    personalVisits ? personalVisits.then(summary => summary.lastVisit ? { bookingDate: summary.lastVisit } : null) : prisma.booking.findFirst({
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
    !isViewMode ? checkPermission(user.role, user.staffId, "customer.update") : Promise.resolve(false),
    !isViewMode ? checkPermission(user.role, user.staffId, "booking.update") : Promise.resolve(false),
  ]));

  let participantCheckout: BookingDrawerPayload["participantCheckout"];
  let companions: BookingDrawerPayload["companions"];
  if (process.env.BOOKING_PARTICIPANTS_ENABLED === "true" && isTrial && booking.people >= 1 && !booking.isMakeup && trialSettings) {
    const rows = await prisma.$queryRaw<NonNullable<BookingDrawerPayload["participantCheckout"]>["slots"]>`
      SELECT p.id, p.position, p.revision, p."customerId", c.name, p.service, p.status, p.source, ws."walletId" AS "selectedWalletId", sp.name AS "selectedPlanName",
        CASE WHEN t.id IS NULL THEN NULL WHEN t.status::text IN ('VOIDED','CANCELLED') THEN 0
          ELSE GREATEST(0, t.amount - GREATEST(COALESCE(t."refundAmount",0),
            COALESCE((SELECT SUM(-r.amount) FROM "Transaction" r WHERE r."refundOfTransactionId" = t.id
              AND r."storeId" = t."storeId" AND r.status::text = 'SUCCESS'
              AND r."paymentStatus"::text IN ('SUCCESS','CONFIRMED')),0)))::integer END AS "collectedAmount",
        (t.status::text IN ('VOIDED','CANCELLED') OR (t.amount > 0 AND GREATEST(COALESCE(t."refundAmount",0),
          COALESCE((SELECT SUM(-r.amount) FROM "Transaction" r WHERE r."refundOfTransactionId" = t.id
            AND r."storeId" = t."storeId" AND r.status::text = 'SUCCESS'
            AND r."paymentStatus"::text IN ('SUCCESS','CONFIRMED')),0)) >= t.amount)) AS "receiptCorrected"
      FROM "BookingParticipantGroup" g JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
      LEFT JOIN "Customer" c ON c.id = p."customerId" AND c."storeId" = p."storeId"
      LEFT JOIN "WalletSession" ws ON ws.id = p."walletSessionId"
      LEFT JOIN "CustomerPlanWallet" pw ON pw.id = ws."walletId" AND pw."storeId" = p."storeId"
      LEFT JOIN "ServicePlan" sp ON sp.id = pw."planId"
      LEFT JOIN "Transaction" t ON t.id = p."collectionTransactionId" AND t."storeId" = p."storeId"
      WHERE g."bookingId" = ${booking.id} AND g."storeId" = ${booking.storeId} ORDER BY p.position`;
    // Never reinterpret an old grouped receipt as somebody's individual payment.
    if (rows.length || (!collectedTx && ["PENDING", "CONFIRMED"].includes(booking.bookingStatus))) {
      const slots = rows.length ? rows : Array.from({ length: booking.people }, (_, index) => ({
        id: null, position: index + 1, revision: 1, customerId: index === 0 ? booking.customerId : null,
        name: index === 0 ? booking.customer.name : null, service: "FIRST_TRIAL", status: "PENDING", collectedAmount: null,
      }));
      const [canCollect, canSell, canDiscount, canCreate, canRead, plans] = await Promise.all([
        !isViewMode && canEditBookingNote ? checkPermission(user.role, user.staffId, "trial.confirm") : false,
        !isViewMode ? checkPermission(user.role, user.staffId, "wallet.create") : false,
        !isViewMode ? checkPermission(user.role, user.staffId, "transaction.discount") : false,
        !isViewMode ? checkPermission(user.role, user.staffId, "customer.create") : false,
        !isViewMode && canEditBookingNote ? checkPermission(user.role, user.staffId, "customer.read") : false,
        prisma.servicePlan.findMany({ where: { storeId: booking.storeId, isActive: true, category: "PACKAGE" },
          select: { id: true, name: true, category: true, price: true, sessionCount: true, validityDays: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      ]);
      const customerIds = slots.flatMap(person => person.customerId ? [person.customerId] : []);
      const ownWallets = await prisma.customerPlanWallet.findMany({ where: {
        storeId: booking.storeId, customerId: { in: customerIds }, status: "ACTIVE",
        startDate: { lte: booking.bookingDate }, OR: [{ expiryDate: null }, { expiryDate: { gte: booking.bookingDate } }],
      }, select: { id: true, customerId: true, plan: { select: { name: true } },
        _count: { select: { sessions: { where: { status: "AVAILABLE" } } } } },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
      participantCheckout = { slots: slots.map(person => ({ ...person,
        wallets: ownWallets.filter(wallet => wallet.customerId === person.customerId && wallet._count.sessions > 0)
          .map(wallet => ({ id: wallet.id, name: wallet.plan.name, available: wallet._count.sessions })),
      })),
        canCollect,
        canResolve: !isViewMode && canEditBookingNote,
        canSell, canDiscount,
        plans: plans.map(plan => ({ ...plan, price: Number(plan.price) })),
        settings: { allowEdit: trialSettings.trialAllowPriceEdit, defaultPrice: trialSettings.trialDefaultPrice,
          minPrice: trialSettings.trialMinPrice, maxPrice: trialSettings.trialMaxPrice },
      };
      companions = { canAdd: canRead && slots.length < 4 && ["PENDING", "CONFIRMED"].includes(booking.bookingStatus), slots: slots.filter(slot => slot.position > 1),
        canCreate,
        canEdit: canRead && ["PENDING", "CONFIRMED"].includes(booking.bookingStatus),
      };
    }
  }

  return {
    canEditServiceNote,
    canEditBookingNote,
    ...(participantCheckout ? { participantCheckout, companions } : {}),
    booking: {
      id: booking.id,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      slotTime: booking.slotTime,
      bookingStatus: booking.bookingStatus,
      bookingType: booking.bookingType,
      bookingSource: booking.bookingSource,
      people: booking.people,
      isMakeup: booking.isMakeup,
      isCheckedIn: booking.isCheckedIn,
      notes: booking.notes,
      treatmentNameSnapshot: null,
      treatmentPriceSnapshot: null,
      treatmentServiceMinutesSnapshot: null,
      treatmentBufferMinutesSnapshot: null,
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        phone: booking.customer.phone,
        notes: booking.customer.notes,
        serviceNote: booking.customer.serviceNote,
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
      makeupCreditLinks: booking.makeupCreditLinks,
      walletSessions: booking.walletSessions,
      expectedAmount:
        booking.expectedAmount == null ? null : Number(booking.expectedAmount),
      attendedPeople: booking.attendedPeople,
      noShowMakeupGranted: booking.noShowMakeupGranted,
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
          collectedMethod: collectedSingleTx?.storedValueLedgerEntry
            ? "STORED_VALUE"
            : (collectedSingleTx?.paymentMethod ?? null),
          // paidAt 是 timestamp（非 DB date 欄位），UTC toISOString().slice(0,10)
          // 在 00:00-08:00 台北時間會跨日顯示成前一天。用 toLocalDateStr 換 +8。
          collectedAt: collectedSingleTx?.paidAt
            ? toLocalDateStr(collectedSingleTx.paidAt)
            : null,
          defaultPrice: resolveSingleBookingTotal({
            expectedAmount: booking.expectedAmount == null ? null : Number(booking.expectedAmount),
            unitPrice: booking.servicePlan?.price == null ? null : Number(booking.servicePlan.price),
            people: booking.people,
          }),
        }
      : null,
    storedValue: null,
    checkout: isSingle
      ? buildCheckoutBlock({
          isMakeup: booking.isMakeup,
          bookingStatus: booking.bookingStatus,
          people: booking.people,
          alreadyCollected: collectedSingleTx != null,
          wallets: adjustWallets,
        })
      : null,
    checkoutToSingle: isPackage
      ? buildCheckoutToSingleBlock({
          isMakeup: booking.isMakeup,
          bookingStatus: booking.bookingStatus,
          planName:
            booking.customerPlanWallet?.plan.name ??
            booking.servicePlan?.name ??
            null,
          remaining: booking.customerPlanWallet?.remainingSessions ?? null,
          singlePrice: 799 * booking.people,
        })
      : null,
  };
}

// 調整結帳方式 Mode B 可行性判斷（PACKAGE_SESSION → SINGLE）。
// Drawer 入口只 gate「補課 / 狀態」這兩個顯而易見的條件；「已扣堂 / 已有 SUCCESS
// 交易」由 adjustCheckoutToSingle action 在執行時 race-safe 重查把關（避免在 Drawer
// 多打查詢，且 PENDING/CONFIRMED 的方案預約依系統 invariant 為 RESERVED、無 SUCCESS 交易）。
function buildCheckoutToSingleBlock(args: {
  isMakeup: boolean;
  bookingStatus: string;
  planName: string | null;
  remaining: number | null;
  singlePrice: number;
}): NonNullable<BookingDrawerPayload["checkoutToSingle"]> {
  let reason: string | null = null;
  if (args.isMakeup) {
    reason = "補課預約不適用調整結帳方式";
  } else if (
    args.bookingStatus !== "PENDING" &&
    args.bookingStatus !== "CONFIRMED"
  ) {
    reason = "僅未完成 / 未取消的預約可調整結帳方式";
  }

  return {
    canAdjustToSingle: reason === null,
    reason,
    currentPlanName: args.planName,
    currentRemaining: args.remaining,
    singleDefaultPrice: args.singlePrice,
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
