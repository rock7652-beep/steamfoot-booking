import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getManagerCustomerFilter, getStoreFilter } from "@/lib/manager-visibility";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { TRIAL_DEFAULTS } from "@/lib/shop-config";
import { todayRange, dayRange } from "@/lib/date-utils";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { BookingStatus, Prisma } from "@prisma/client";

export interface ListBookingsOptions {
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  status?: BookingStatus;
  customerId?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listBookings
// Owner: 所有預約
// Manager: 只有自己名下顧客的預約
// Customer: 只有自己的預約
// ============================================================

export async function listBookings(options: ListBookingsOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireSession();
  const { dateFrom, dateTo, status, customerId, activeStoreId, page = 1, pageSize = 30 } = options;
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const readStoreId = storeIdForViewContext(activeStoreId ?? null, storeViewContext);

  // 後端強制資料隔離（讀取型：受 visibility mode 控制）
  let whereCustomer: Record<string, unknown> = {};
  if (readUser.role === "CUSTOMER") {
    // 走 canonical resolver — session.customerId 可能 stale（與 createBooking 寫入路徑同源）
    const canonicalId = await getCanonicalCustomerIdForSession(readUser);
    if (!canonicalId) return { bookings: [], total: 0, page, pageSize };
    whereCustomer = { id: canonicalId };
  } else if (readUser.role !== "ADMIN" && readUser.staffId) {
    const customerFilter = getManagerCustomerFilter(
      readUser.role,
      readUser.staffId,
      readStoreId ?? readUser.storeId,
    );
    // getManagerCustomerFilter 回傳 { customer: { assignedStaffId: ... } } 或 {}
    // 這裡需要取出 customer 層級的 where
    const nested = customerFilter.customer as Record<string, unknown> | undefined;
    whereCustomer = nested ?? {};
  }

  const where: Record<string, unknown> = {
    ...getStoreFilter(readUser, readStoreId),
    ...(Object.keys(whereCustomer).length > 0 && { customer: whereCustomer }),
    ...(customerId ? { customerId } : {}),
    ...(status ? { bookingStatus: status } : {}),
    ...(dateFrom || dateTo
      ? {
          bookingDate: {
            ...(dateFrom ? { gte: new Date(dateFrom + "T00:00:00") } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
          },
        }
      : {}),
  };

  // ⚡ Customer 不需要 customer/serviceStaff include（自己看自己的）
  const isCustomer = readUser.role === "CUSTOMER";
  const includeFields = isCustomer
    ? {
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        servicePlan: { select: { id: true, name: true } },
      }
    : {
        customer: { select: { id: true, name: true, phone: true } },
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        serviceStaff: { select: { id: true, displayName: true } },
        servicePlan: { select: { id: true, name: true } },
      };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: includeFields,
      orderBy: [{ bookingDate: "desc" }, { slotTime: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  return { bookings, total, page, pageSize };
}

// ============================================================
// getBookingDetail
// ============================================================

export async function getBookingDetail(bookingId: string) {
  const user = await requireSession();
  return getBookingDetailForUser(bookingId, user);
}

/**
 * getBookingDetail 的核心：接受已解析的 session user，讓已經呼叫過
 * requireStaffSession() 的端（如 booking drawer）重用，省掉重複解析 session。
 * store filter 與 CUSTOMER ownership 邊界跟 getBookingDetail 完全一致。
 */
export async function getBookingDetailForUser(
  bookingId: string,
  user: Awaited<ReturnType<typeof requireSession>>,
  activeStoreId?: string | null,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, ...getStoreFilter(user, activeStoreId) },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedStaffId: true,
          serviceNote: true, // 內部服務備註（後台限定）— 預約詳情顧客資訊顯示
        },
      },
      revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      servicePlan: true,
      customerPlanWallet: {
        include: { plan: true },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "預約不存在");

  // 「顧客屬於店」：所有 Manager 可查看任何預約詳情
  if (user.role === "CUSTOMER") {
    // 走 canonical resolver — session.customerId 可能 stale
    const canonicalId = await getCanonicalCustomerIdForSession(user);
    if (!canonicalId || booking.customerId !== canonicalId) {
      throw new AppError("FORBIDDEN", "只能查看自己的預約");
    }
  }

  return booking;
}

// ============================================================
// getDayBookings — 取某天的完整預約清單（後台日曆用）
// ============================================================

export async function getDayBookings(date: string, activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const readStoreId = storeIdForViewContext(activeStoreId ?? null, storeViewContext);

  const dateObj = new Date(date + "T00:00:00Z");

  // 所有店長可看全部預約（共享查看）
  return prisma.booking.findMany({
    where: {
      ...getStoreFilter(readUser, readStoreId),
      bookingDate: dateObj,
      bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        },
      },
      revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      servicePlan: { select: { name: true } },
    },
    orderBy: { slotTime: "asc" },
  });
}

// ============================================================
// getMonthlyRevenueSummary
// Owner: 全部 / Manager: 自己的
// ============================================================

export async function getMonthlyRevenueSummary(year: number, month: number, activeStoreId?: string | null) {
  const user = await requireStaffSession();

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

  const staffFilter =
    user.role !== "ADMIN" && user.staffId
      ? { revenueStaffId: user.staffId }
      : {};

  const result = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      ...getStoreFilter(user, activeStoreId),
      ...staffFilter,
      createdAt: { gte: startDate, lte: endDate },
      transactionType: {
        in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Enrich with staff names
  const staffIds = result.map((r) => r.revenueStaffId);
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = new Map(staffList.map((s) => [s.id, s.displayName]));

  return result.map((r) => ({
    staffId: r.revenueStaffId,
    staffName: staffMap.get(r.revenueStaffId) ?? "Unknown",
    totalRevenue: Number(r._sum.amount ?? 0),
    transactionCount: r._count.id,
  }));
}

// ============================================================
// getMonthBookingSummary — 取月份日曆資料（含各日期的預約統計）
// ============================================================

// PR #312-B-1：月曆 summary 加快取。
//   /dashboard/bookings 是店長每天最常用頁，且每次真導航（換月 / 回上頁）都重跑
//   getMonthBookingSummary（prod 實測 ~210ms）。改為 unstable_cache：
//   - key = store scope + year + month + 今天日期字串（todayStartLocal 影響「有效堂數」
//     的 expiryDate 判界，把當天日納入 key 避免跨午夜 stale；另有 60s revalidate 兜底）。
//   - tag = bookingsSummary：revalidateBookings()（新增/完成/取消/未到/補課等 mutation
//     皆呼叫）會 updateTag(bookingsSummary)，故快取一定在 mutation 後失效、不會 stale。
//   - auth / store 解析留在 wrapper 外層（cache 函式內不可用 session）。
export async function getMonthBookingSummary(
  year: number,
  month: number,
  activeStoreId?: string | null,
) {
  const user = await requireStaffSession();
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const readStoreId = storeIdForViewContext(activeStoreId ?? null, storeViewContext);
  // getStoreFilter 回 { storeId } 或 {}（ADMIN __all__）。抽出 scope 當 cache key；
  // null = 跨店（ADMIN 未指定 store）。重建 where 與原本 spread 行為完全一致。
  const filter = getStoreFilter(readUser, readStoreId);
  const scopeStoreId = (filter.storeId as string | undefined) ?? null;
  const todayDateStr = todayRange().dateStr;
  return getCachedMonthBookingSummary(scopeStoreId, year, month, todayDateStr);
}

function getCachedMonthBookingSummary(
  scopeStoreId: string | null,
  year: number,
  month: number,
  todayDateStr: string,
) {
  return unstable_cache(
    async () =>
      computeMonthBookingSummary(scopeStoreId, year, month, todayDateStr),
    [
      "month-booking-summary",
      scopeStoreId ?? "ALL",
      String(year),
      String(month),
      todayDateStr,
    ],
    { revalidate: 60, tags: [CACHE_TAGS.bookingsSummary] },
  )();
}

async function computeMonthBookingSummary(
  scopeStoreId: string | null,
  year: number,
  month: number,
  todayDateStr: string,
) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  // ⚡ 優化：用 groupBy 取每日統計，避免 fetch 整月所有 booking 行
  // 月曆 cell 要顯示各日 booking strips，所以另外拉一次輕量 findMany（select 最小欄位）。
  const monthWhere: Prisma.BookingWhereInput = {
    ...(scopeStoreId ? { storeId: scopeStoreId } : {}),
    bookingDate: { gte: startDate, lte: endDate },
    bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
  };

  // 「有效堂數」沿用顧客清單（PR #280）的唯一定義：ACTIVE + 尚有剩餘 + 未過期的 PACKAGE。
  // 排除 TRIAL / SINGLE / 點數型 / 已過期 / 已用完。expiryDate 用「今天本地日 00:00」
  // 判界，當天到期仍算有效；不手刻時區。Server-side reduce 成單一
  // 數字 customer.validPackageSessions，不把 wallet 陣列送到 client。
  const todayStartLocal = dayRange(todayDateStr).start;
  const validPackageWalletWhere: Prisma.CustomerPlanWalletWhereInput = {
    status: "ACTIVE",
    remainingSessions: { gt: 0 },
    plan: { category: "PACKAGE" },
    OR: [{ expiryDate: null }, { expiryDate: { gte: todayStartLocal } }],
  };
  const [dailyCounts, staffCounts, monthBookings] = await Promise.all([
    prisma.booking.groupBy({
      by: ["bookingDate"],
      where: monthWhere,
      _count: { id: true },
      _sum: { people: true },
    }),
    prisma.booking.groupBy({
      by: ["bookingDate", "revenueStaffId"],
      where: { ...monthWhere, revenueStaffId: { not: null } },
      _count: { id: true },
    }),
    // Per-booking detail rich enough to power the day-detail panel
    // **without** a second per-day round-trip — phone for tel: link,
    // assignedStaff/serviceStaff for the panel's staff fallback chain,
    // servicePlan.name for the row's service label, isCheckedIn for the
    // KPI counter. Selects are still flat (`select` not `include`) so
    // the wire payload stays bounded.
    prisma.booking.findMany({
      where: monthWhere,
      select: {
        id: true,
        bookingDate: true,
        slotTime: true,
        bookingStatus: true,
        isMakeup: true,
        isCheckedIn: true,
        people: true,
        // PR-3d：實際到店人數（FIRST_TRIAL 部分到店；day-panel 行尾顯示「實到 N/M」）
        attendedPeople: true,
        // 體驗 499 PR-2：日面板 badge「體驗·未收款｜NT$xxx」用（最小新增 2 欄）
        bookingType: true,
        expectedAmount: true,
        // PR-D1D：badge 顯示金額容錯 — LIFF 建立的 FIRST_TRIAL `expectedAmount=null`，
        // 需照 storeId 退到 ShopConfig.trialDefaultPrice（batch fetch 於 collectedTx 之後）。
        storeId: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            serviceNote: true, // 內部服務備註（後台限定）— 當日清單提醒 + 預約詳情顯示
            assignedStaff: {
              select: { id: true, displayName: true, colorCode: true },
            },
            // 有效 PACKAGE 堂數（當日預約 Drawer 顯示「剩 N 堂」）— batched relation，無 N+1。
            planWallets: {
              where: validPackageWalletWhere,
              select: { remainingSessions: true },
            },
          },
        },
        revenueStaff: {
          select: { id: true, displayName: true, colorCode: true },
        },
        serviceStaff: {
          select: { id: true, displayName: true },
        },
        servicePlan: {
          select: { name: true },
        },
        // 後台預約建立流程不寫 servicePlanId，PACKAGE_SESSION 是用 wallet 帶方案，
        // 真正方案名稱要從 wallet.plan 取（servicePlan 幾乎一律 null）。
        customerPlanWallet: {
          select: { plan: { select: { name: true } } },
        },
      },
      orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    }),
  ]);

  // 體驗 499 PR-3：FIRST_TRIAL 預約是否「已收款」— 一次 batch 查詢
  // （TRIAL_PURCHASE + status=SUCCESS 的交易），non-collected 不會有任何
  // Transaction（PR-2 保證），collected 才有一筆。不是新欄位、純 derived。
  const trialBookingIds = monthBookings
    .filter((b) => b.bookingType === "FIRST_TRIAL")
    .map((b) => b.id);
  const collectedTx =
    trialBookingIds.length > 0
      ? await prisma.transaction.findMany({
          where: {
            bookingId: { in: trialBookingIds },
            transactionType: "TRIAL_PURCHASE",
            status: "SUCCESS",
          },
          select: { bookingId: true, amount: true },
        })
      : [];
  const collectedMap = new Map<string, number>();
  for (const t of collectedTx) {
    if (t.bookingId) collectedMap.set(t.bookingId, Number(t.amount));
  }

  // PR-D1D：FIRST_TRIAL badge fallback — 用 storeId 批次撈 ShopConfig.trialDefaultPrice。
  // 缺 ShopConfig row 時用 TRIAL_DEFAULTS.trialDefaultPrice，與 getTrialSettings 一致。
  // ADMIN __all__ 視角會包含多 store；非 ADMIN 永遠單店，N = 1。
  const trialStoreIds = [
    ...new Set(
      monthBookings
        .filter((b) => b.bookingType === "FIRST_TRIAL")
        .map((b) => b.storeId),
    ),
  ];
  const trialDefaultByStore = new Map<string, number>();
  if (trialStoreIds.length > 0) {
    const configs = await prisma.shopConfig.findMany({
      where: { storeId: { in: trialStoreIds } },
      select: { storeId: true, trialDefaultPrice: true },
    });
    for (const c of configs) {
      trialDefaultByStore.set(c.storeId, Number(c.trialDefaultPrice));
    }
  }

  // 取涉及的 staff 名稱
  const staffIds = [...new Set(staffCounts.map((s) => s.revenueStaffId!).filter(Boolean))];
  const staffList = staffIds.length > 0
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, displayName: true, colorCode: true },
      })
    : [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  // 組裝每日資料 — 每筆 booking 一次寫入完整 detail，讓前端 day panel
  // 直接從 monthData 篩出當日，不需要再打 fetchDayDetail。
  interface DayBookingEntry {
    id: string;
    slotTime: string;
    bookingStatus: string;
    isMakeup: boolean;
    isCheckedIn: boolean;
    people: number;
    // PR-3d：實際到店人數（FIRST_TRIAL 部分到店；null = 未記錄／全到）
    attendedPeople: number | null;
    bookingType: string;
    expectedAmount: number | null;
    // PR-D1D：FIRST_TRIAL badge fallback 用，僅 FIRST_TRIAL 有值；其他 type = null。
    // 為 LIFF 建立的體驗（expectedAmount=null）退回 store 預設體驗價。
    trialDefaultPrice: number | null;
    // 體驗 499 PR-3：是否已現場收款 + 實收金額（derived from TRIAL_PURCHASE
    // SUCCESS tx；badge 由「未收款」翻成「已收款」）
    collected: boolean;
    collectedAmount: number | null;
    // 前端 calendar strip 用的扁平欄位（避免每筆都做 nested optional chain）
    customerName: string;
    staffId: string | null;
    staffName: string | null;
    staffColor: string | null;
    // 完整 nested 欄位 — day panel render + 篩選 fallback chain 用
    customer: {
      id: string;
      name: string;
      phone: string;
      serviceNote: string | null;
      assignedStaff: {
        id: string;
        displayName: string;
        colorCode: string;
      } | null;
      // 有效 PACKAGE 剩餘堂數加總（已在 query where 收斂；0 = 無有效方案）。
      validPackageSessions: number;
    };
    revenueStaff: { id: string; displayName: string; colorCode: string } | null;
    serviceStaff: { id: string; displayName: string } | null;
    servicePlan: { name: string } | null;
    customerPlanWallet: { plan: { name: string } } | null;
  }
  interface DayEntry {
    total: number;
    totalPeople: number;
    staffBookings: { staffName: string; colorCode: string; count: number }[];
    bookings: DayBookingEntry[];
  }
  const dailyMap = new Map<string, DayEntry>();

  for (let day = 1; day <= endDate.getUTCDate(); day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    dailyMap.set(dateKey, { total: 0, totalPeople: 0, staffBookings: [], bookings: [] });
  }

  // 將完整 booking list groupBy date 後塞入 dailyMap
  for (const b of monthBookings) {
    const dateKey = b.bookingDate.toISOString().slice(0, 10);
    const entry = dailyMap.get(dateKey);
    if (!entry) continue;
    entry.bookings.push({
      id: b.id,
      slotTime: b.slotTime,
      bookingStatus: b.bookingStatus,
      isMakeup: b.isMakeup,
      isCheckedIn: b.isCheckedIn,
      people: b.people,
      attendedPeople: b.attendedPeople,
      bookingType: b.bookingType,
      // Decimal → number 在 server 邊界轉換，避免 RSC 序列化問題
      expectedAmount: b.expectedAmount == null ? null : Number(b.expectedAmount),
      trialDefaultPrice:
        b.bookingType === "FIRST_TRIAL"
          ? trialDefaultByStore.get(b.storeId) ?? TRIAL_DEFAULTS.trialDefaultPrice
          : null,
      collected: collectedMap.has(b.id),
      collectedAmount: collectedMap.get(b.id) ?? null,
      customerName: b.customer.name,
      staffId: b.revenueStaff?.id ?? null,
      staffName: b.revenueStaff?.displayName ?? null,
      staffColor: b.revenueStaff?.colorCode ?? null,
      customer: {
        id: b.customer.id,
        name: b.customer.name,
        phone: b.customer.phone,
        serviceNote: b.customer.serviceNote,
        assignedStaff: b.customer.assignedStaff
          ? {
              id: b.customer.assignedStaff.id,
              displayName: b.customer.assignedStaff.displayName,
              colorCode: b.customer.assignedStaff.colorCode,
            }
          : null,
        // server-side reduce 成單一數字，不把 wallet 陣列送到 client
        validPackageSessions: b.customer.planWallets.reduce(
          (sum, w) => sum + w.remainingSessions,
          0,
        ),
      },
      revenueStaff: b.revenueStaff
        ? {
            id: b.revenueStaff.id,
            displayName: b.revenueStaff.displayName,
            colorCode: b.revenueStaff.colorCode,
          }
        : null,
      serviceStaff: b.serviceStaff
        ? {
            id: b.serviceStaff.id,
            displayName: b.serviceStaff.displayName,
          }
        : null,
      servicePlan: b.servicePlan ? { name: b.servicePlan.name } : null,
      customerPlanWallet: b.customerPlanWallet
        ? { plan: { name: b.customerPlanWallet.plan.name } }
        : null,
    });
  }

  for (const row of dailyCounts) {
    const dateKey = row.bookingDate.toISOString().slice(0, 10);
    const entry = dailyMap.get(dateKey);
    if (entry) {
      entry.total = row._count.id;
      entry.totalPeople = row._sum.people ?? 0;
    }
  }

  // 按日期+staff 組裝
  const staffByDate = new Map<string, Map<string, number>>();
  for (const row of staffCounts) {
    const dateKey = row.bookingDate.toISOString().slice(0, 10);
    if (!staffByDate.has(dateKey)) staffByDate.set(dateKey, new Map());
    staffByDate.get(dateKey)!.set(row.revenueStaffId!, row._count.id);
  }

  for (const [dateKey, staffCountMap] of staffByDate) {
    const entry = dailyMap.get(dateKey);
    if (!entry) continue;
    entry.staffBookings = Array.from(staffCountMap.entries()).map(([sid, count]) => {
      const staff = staffMap.get(sid);
      return {
        staffName: staff?.displayName ?? "Unknown",
        colorCode: staff?.colorCode ?? "#999",
        count,
      };
    });
  }

  return Array.from(dailyMap.entries()).map(([dateStr, data]) => ({
    date: dateStr,
    totalBookingCount: data.total,
    totalPeople: data.totalPeople,
    staffBookings: data.staffBookings,
    bookings: data.bookings,
  }));
}
