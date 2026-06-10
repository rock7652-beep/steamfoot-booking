import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getStoreFilter } from "@/lib/manager-visibility";
import { monthRange, toLocalMonthStr, todayRange } from "@/lib/date-utils";
import type { CustomerStage, Prisma } from "@prisma/client";

/**
 * 桌機版顧客列表 toolbar 支援的複合篩選：
 * - status     狀態（合併 customerStage + LINE 綁定）
 *                 linked   LINE 已綁定
 *                 unlinked LINE 未綁定
 *                 lead     名單（未成為顧客）
 *                 customer 顧客（已體驗 / 已購課 / 已停用）
 * - visit      來店
 *                 month    本月曾到店
 *                 stale30  超過 30 天未到店（排除從未到店）
 *                 never    從未到店
 * - referral   推薦
 *                 has      有推薦紀錄（曾介紹過顧客）
 *                 none     無推薦紀錄
 * - sort       最近來店 / 建立時間 / 累積點數
 */
export type CustomerListStatus = "linked" | "unlinked" | "lead" | "customer";
export type CustomerListVisit = "month" | "stale30" | "never";
export type CustomerListReferral = "has" | "none";
export type CustomerListSort = "recent" | "created" | "points";

export interface ListCustomersOptions {
  stage?: CustomerStage;
  status?: CustomerListStatus;
  visit?: CustomerListVisit;
  referral?: CustomerListReferral;
  search?: string; // name / phone / email / lineName
  assignedStaffId?: string; // 篩選直屬店長
  sort?: CustomerListSort;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listCustomers
// Owner + Manager: 所有顧客（共享查看）
// Manager 也能看全部，但修改受權限控制
// ============================================================

export async function listCustomers(options: ListCustomersOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireStaffSession();
  const {
    stage,
    status,
    visit,
    referral,
    search,
    assignedStaffId,
    sort = "recent",
    activeStoreId,
    page = 1,
    pageSize = 20,
  } = options;

  // ----- 狀態（LINE 綁定 / 顧客階段）-----
  const statusWhere: Prisma.CustomerWhereInput =
    status === "linked"
      ? { lineLinkStatus: "LINKED" }
      : status === "unlinked"
        ? { lineLinkStatus: { not: "LINKED" } }
        : status === "lead"
          ? { customerStage: "LEAD" }
          : status === "customer"
            ? { customerStage: { not: "LEAD" } }
            : {};

  // ----- 來店（本月 / 30 天未到 / 從未到）-----
  // 以 Asia/Taipei 月首為界；`lt` cutoff 語意自動排除 null（Postgres 比較不含 null）
  const monthStart = monthRange(toLocalMonthStr()).start;
  const stale30Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const visitWhere: Prisma.CustomerWhereInput =
    visit === "month"
      ? { lastVisitAt: { gte: monthStart } }
      : visit === "stale30"
        ? { lastVisitAt: { lt: stale30Cutoff } }
        : visit === "never"
          ? { lastVisitAt: null }
          : {};

  // ----- 推薦紀錄（曾介紹過其他顧客）-----
  const referralWhere: Prisma.CustomerWhereInput =
    referral === "has"
      ? { sponsoredCustomers: { some: {} } }
      : referral === "none"
        ? { sponsoredCustomers: { none: {} } }
        : {};

  // 不再依 Manager 隔離 — 所有店長都能看全部顧客
  // 已合併（mergedIntoCustomerId != null）/ User=SUSPENDED 的 row 仍出現在列表，
  // 由 UI 灰掉並隱藏「+指派/查看」操作（防店長誤操作 placeholder/duplicate）。
  // searchCustomers (autocomplete) / getCustomerDetail 仍會擋掉，這裡只是列表呈現。
  const where: Prisma.CustomerWhereInput = {
    ...getStoreFilter(user, activeStoreId),
    ...(stage ? { customerStage: stage } : {}),
    ...(assignedStaffId ? { assignedStaffId } : {}),
    ...statusWhere,
    ...visitWhere,
    ...referralWhere,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" as const } },
            { lineName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // ----- 排序 -----
  // 已合併（mergedIntoCustomerId != null）的 row 永遠沉到列表最底（稽核用、非有效顧客）。
  // 必須是 orderBy 第一順位且在 DB 層、分頁前套用，否則 merged row 會散落在各頁中間。
  // nulls:"first" → active（null）在前、merged（non-null）在後；其餘排序為次要鍵。
  const mergedLastOrder: Prisma.CustomerOrderByWithRelationInput = {
    mergedIntoCustomerId: { sort: "asc", nulls: "first" },
  };
  // lastVisitAt 可能為 null → 用 nulls:"last" 避免空資料排前面（Prisma 6 支援）
  const baseOrderBy: Prisma.CustomerOrderByWithRelationInput[] =
    sort === "created"
      ? [{ createdAt: "desc" }]
      : sort === "points"
        ? [{ totalPoints: "desc" }, { createdAt: "desc" }]
        : [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = [
    mergedLastOrder,
    ...baseOrderBy,
  ];

  // 「有效堂數」只計 PACKAGE 類方案：ACTIVE + 尚有剩餘 + 未過期。
  // 排除 TRIAL / SINGLE / 點數型 / 已過期 / 已用完，避免店長誤判是否需提醒儲值。
  // expiryDate 用 todayRange().start（本地日 00:00）判界，當天到期仍算有效；不手刻時區。
  const { start: todayStartLocal } = todayRange();
  const validPackageWalletWhere: Prisma.CustomerPlanWalletWhereInput = {
    status: "ACTIVE",
    remainingSessions: { gt: 0 },
    plan: { category: "PACKAGE" },
    OR: [{ expiryDate: null }, { expiryDate: { gte: todayStartLocal } }],
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        user: { select: { email: true, status: true } },
        assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        sponsor: { select: { id: true, name: true } },
        planWallets: {
          where: validPackageWalletWhere,
          select: { remainingSessions: true },
        },
        _count: { select: { sponsoredCustomers: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  // 「最近來店」顯示來源：當頁 customers 的最近一筆 COMPLETED booking。
  // 為何不用 Customer.lastVisitAt：prod 該欄位多數 stale/null，但顧客其實有
  // COMPLETED bookings。本 PR 範圍只修「列表顯示」，不 backfill、不改 booking
  // 完成流程、不動 schema。Known limitation（PR description 已記）：
  //   - visit filter（本月/30天未到/從未到）與 sort 仍使用 Customer.lastVisitAt
  //     → 顯示值與 filter/sort 可能短暫不一致，待 Phase 2 處理。
  const customerIds = customers.map((c) => c.id);
  const latestCompletedBookings = customerIds.length
    ? await prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: customerIds },
          bookingStatus: "COMPLETED",
        },
        _max: { bookingDate: true },
      })
    : [];
  const lastVisitFromBooking = new Map<string, Date | null>(
    latestCompletedBookings.map((r) => [r.customerId, r._max.bookingDate]),
  );

  // 計算每位顧客的有效 PACKAGE 堂數加總 + 推薦數；以 booking-derived 取代顯示用 lastVisitAt。
  // 命名用 validPackageSessions（而非 totalRemainingSessions）以明示已收斂語意：
  // planWallets 已在上方 where 過濾為「有效 PACKAGE」，故此處 reduce 即為有效堂數。
  const customersWithStats = customers.map((c) => ({
    ...c,
    // 顯示優先：booking-derived；若該顧客沒任何 COMPLETED booking，
    // 退回 Customer.lastVisitAt 維持向後相容（極少數舊資料場景）
    lastVisitAt: lastVisitFromBooking.get(c.id) ?? c.lastVisitAt,
    validPackageSessions: c.planWallets.reduce(
      (sum, w) => sum + w.remainingSessions,
      0
    ),
    sponsoredCount: c._count.sponsoredCustomers,
  }));

  return { customers: customersWithStats, total, page, pageSize };
}

// Helper 抽到 ./customer-list-helpers.ts 供 vitest 直接 import 測試
// （避免測試環境拉進 next-auth / session 等 side-effect）。

// ============================================================
// searchCustomers — 用於 autocomplete（輕量版）
// ============================================================

export async function searchCustomers(query: string, limit = 10, activeStoreId?: string | null) {
  const user = await requireStaffSession();

  if (!query || query.length < 1) return [];

  // autocomplete / booking 新增 / 指派方案皆走這支查詢；不能讓店長選到
  // 已合併或登入帳號已停用的 placeholder/duplicate 顧客（與 customers-table
  // 的 isInactiveRow 對齊：mergedIntoCustomerId != null 或 user.status=SUSPENDED）。
  return prisma.customer.findMany({
    where: {
      ...getStoreFilter(user, activeStoreId),
      mergedIntoCustomerId: null,
      NOT: { user: { is: { status: "SUSPENDED" } } },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      customerStage: true,
      assignedStaff: { select: { displayName: true, colorCode: true } },
      planWallets: {
        where: { status: "ACTIVE" },
        select: { remainingSessions: true },
      },
    },
    orderBy: { name: "asc" },
    take: limit,
  });
}

// ============================================================
// getCustomerDetail
// Owner: 任意顧客
// Manager: 可查看任何顧客（共享查看），但修改受權限控制
// Customer: 只有自己
// ============================================================

export async function getCustomerDetail(customerId: string) {
  const user = await requireSession();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    include: {
      user: { select: { email: true, image: true, status: true } },
      assignedStaff: {
        select: { id: true, displayName: true, colorCode: true },
      },
      sponsor: { select: { id: true, name: true, phone: true } },
      // UI 使用的 count：sponsoredCustomers 推薦人數、bookings 累積到店次數
      // 注意：若使用不存在的 enum 值（例如尚未 merge 的 CHECKED_IN），Prisma 型別會
      // 退化成 base Customer，導致 `.planWallets` 等 relation 在 build 時消失。
      // 目前 main schema 的「完成到店」終態就是 COMPLETED。
      _count: {
        select: {
          sponsoredCustomers: true,
          bookings: { where: { bookingStatus: "COMPLETED" } },
        },
      },
      planWallets: {
        include: {
          plan: {
            select: { id: true, name: true, category: true, sessionCount: true, price: true },
          },
          // PR-2 wallet-session-ui：每張錢包的單堂明細
          sessions: {
            orderBy: { sessionNo: "asc" },
            include: {
              booking: { select: { bookingDate: true, slotTime: true } },
              voidedByStaff: { select: { displayName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      bookings: {
        orderBy: { bookingDate: "desc" },
        take: 20,
        include: {
          revenueStaff: { select: { displayName: true } },
          serviceStaff: { select: { displayName: true } },
        },
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  // 已被合併進其他顧客的 source row → 視為不存在（Phase 1 行為）
  // 之後可選擇導到 target；目前最安全的處理是讓 staff 直接走列表搜尋。
  if (customer.mergedIntoCustomerId) {
    throw new AppError("NOT_FOUND", "此顧客已合併進其他顧客");
  }

  // 對應 User 已停用（孤兒 placeholder 或人工 SUSPEND）→ 同樣視為不存在，
  // 與 customers-table 的 isInactiveRow / searchCustomers 過濾對齊，
  // 防店長從直連網址或預約 / 指派方案流程繞進來操作。
  if (customer.user?.status === "SUSPENDED") {
    throw new AppError("NOT_FOUND", "此顧客的登入帳號已停用");
  }

  // Manager 現在可以查看所有顧客（共享查看）
  // 只有 CUSTOMER 角色限制只看自己
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的資料");
    }
  }

  return customer;
}

// ============================================================
// getCustomerDrawerDetail — 顧客管理「右滑 Drawer」專用 slim query（PR-4）
//
// 與 getCustomerDetail 的差異（僅取 drawer 實際 render 的欄位）：
//   - 不抓 bookings[20]（含 revenue/serviceStaff join）
//   - 不抓 transactions[20]
//   - planWallets 只抓 status=ACTIVE，且 sessions 只取 status（不抓 booking /
//     voidedByStaff nested include）；失效張數改由 _count.planWallets 計算
//   - user 只取 email / status（status 供停用判斷與系統資訊顯示）
// 權限 / 邊界與 getCustomerDetail 完全一致（getStoreFilter 跨店、merged、
// SUSPENDED、CUSTOMER 只看自己）。不改 getCustomerDetail，[id] 詳情頁不受影響。
// ============================================================

export async function getCustomerDrawerDetail(customerId: string) {
  const user = await requireSession();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getStoreFilter(user) },
    include: {
      user: { select: { email: true, status: true } },
      sponsor: { select: { id: true, name: true, phone: true } },
      _count: {
        select: {
          sponsoredCustomers: true,
          bookings: { where: { bookingStatus: "COMPLETED" } },
          // 全部錢包數（含已失效）→ drawer 用 total - active 算失效張數
          planWallets: true,
        },
      },
      planWallets: {
        where: { status: "ACTIVE" },
        include: {
          plan: { select: { id: true, name: true, sessionCount: true } },
          sessions: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  // 與 getCustomerDetail 相同的安全閘（行為一致，防繞進來操作）
  if (customer.mergedIntoCustomerId) {
    throw new AppError("NOT_FOUND", "此顧客已合併進其他顧客");
  }
  if (customer.user?.status === "SUSPENDED") {
    throw new AppError("NOT_FOUND", "此顧客的登入帳號已停用");
  }
  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的資料");
    }
  }

  return customer;
}

// ============================================================
// getCustomerMergePreview — 後台合併頁的 side-by-side 預覽
// 回傳 source / target 兩筆 customer 摘要 + booking / wallet / transaction 數量。
// 與 getCustomerDetail 不同：本 query 不會 NOT_FOUND 已合併的 source（merge 工具
// 的職責就是看見已合併過的歷史，但 source 必須是 active 才能進 merge action）。
// 權限：要求 staff session + 相同 store；本身不直接操作資料，僅提供視覺確認。
// ============================================================

export type CustomerMergePreviewRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lineName: string | null;
  lineLinkStatus: string;
  storeId: string;
  storeName: string;
  customerStage: string;
  totalPoints: number;
  hasUserId: boolean;
  mergedIntoCustomerId: string | null;
  bookingCount: number;
  walletCount: number;
  transactionCount: number;
  createdAt: Date;
};

export async function getCustomerMergePreview(
  sourceCustomerId: string,
  targetCustomerId: string,
): Promise<{ source: CustomerMergePreviewRow; target: CustomerMergePreviewRow }> {
  const user = await requireStaffSession();

  const ids = [sourceCustomerId, targetCustomerId];
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    include: {
      store: { select: { id: true, name: true } },
      _count: {
        select: {
          bookings: true,
          planWallets: true,
          transactions: true,
        },
      },
    },
  });

  const map = new Map(customers.map((c) => [c.id, c]));
  const source = map.get(sourceCustomerId);
  const target = map.get(targetCustomerId);
  if (!source) throw new AppError("NOT_FOUND", `找不到來源顧客 ${sourceCustomerId}`);
  if (!target) throw new AppError("NOT_FOUND", `找不到目標顧客 ${targetCustomerId}`);

  // store access：兩筆都必須 user 看得到
  const userStoreFilter = getStoreFilter(user);
  const allowedStoreId = (userStoreFilter as { storeId?: string }).storeId;
  // ADMIN getStoreFilter() 會回 {}（無篩選），不擋；非 ADMIN 才比對
  if (user.role !== "ADMIN") {
    if (allowedStoreId && (source.storeId !== allowedStoreId || target.storeId !== allowedStoreId)) {
      throw new AppError("FORBIDDEN", "無權存取其他店舖的顧客");
    }
  }

  const toRow = (c: (typeof customers)[number]): CustomerMergePreviewRow => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    lineName: c.lineName,
    lineLinkStatus: c.lineLinkStatus,
    storeId: c.storeId,
    storeName: c.store.name,
    customerStage: c.customerStage,
    totalPoints: c.totalPoints,
    hasUserId: c.userId != null,
    mergedIntoCustomerId: c.mergedIntoCustomerId,
    bookingCount: c._count.bookings,
    walletCount: c._count.planWallets,
    transactionCount: c._count.transactions,
    createdAt: c.createdAt,
  });

  return { source: toRow(source), target: toRow(target) };
}
