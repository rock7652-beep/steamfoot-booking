"use server";

/**
 * Store Todos — 店長首頁「今天待處理」資料來源
 *
 * 唯讀聚合：跨四個資料源（Transaction / Booking / WalletSession / Customer）
 * 找出店長今天最該動手的事。本檔嚴格遵守：
 *
 *  1. 只讀，不寫；不動 schema；不跑 migration
 *  2. 不改 paymentStatus / bookingStatus 任何狀態機
 *  3. 透過 getStoreFilter 做店隔離；同 user 看不到別店資料
 *  4. 同一位顧客最多出現 1 次（取最高優先級的待辦）
 *  5. 最多回 5 件，total 額外回傳給「還有 N 件」顯示
 *
 * 待辦類型優先級（小者優先）：
 *   1. PAYMENT       — 待確認收款（PENDING TRANSFER/UNPAID）
 *   2. BOOKING       — 今日預約待完成（PENDING / CONFIRMED）
 *   3. FOLLOW_UP     — ≥14 天沒回來且無未來預約
 *   4. LOW_SESSIONS  — WalletSession AVAILABLE 加總 ≤ 1
 */

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday, toLocalDateStr } from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { customerIdFromTodoId } from "@/lib/store-todo-key";
import type { PaymentMethod } from "@prisma/client";

export type StoreTodoType = "PAYMENT" | "BOOKING" | "FOLLOW_UP" | "LOW_SESSIONS";

export interface StoreTodoItem {
  id: string;
  type: StoreTodoType;
  label: string;
  message: string;
  href: string;
  actionLabel: string;
  priority: number;
}

export interface StoreTodosResult {
  items: StoreTodoItem[];
  total: number;
}

const TYPE_LABEL: Record<StoreTodoType, string> = {
  PAYMENT: "收款",
  BOOKING: "預約",
  FOLLOW_UP: "回訪",
  LOW_SESSIONS: "堂數",
};

const TYPE_PRIORITY: Record<StoreTodoType, number> = {
  PAYMENT: 1,
  BOOKING: 2,
  FOLLOW_UP: 3,
  LOW_SESSIONS: 4,
};

const FOLLOW_UP_DAYS = 14;
const FOLLOW_UP_CANDIDATE_LIMIT = 50;
const LOW_SESSIONS_THRESHOLD = 1;
const PER_TYPE_FETCH = 10;
const MAX_DISPLAY = 5;

export async function getStoreTodos(opts: {
  activeStoreId: string | null;
}): Promise<StoreTodosResult> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, opts.activeStoreId);
  const canSeePayments = await checkPermission(
    user.role,
    user.staffId,
    "transaction.create"
  );

  const todayBookingDate = bookingDateToday();
  const todayStr = toLocalDateStr();
  const cutoff = new Date(`${todayStr}T00:00:00+08:00`);
  cutoff.setUTCDate(cutoff.getUTCDate() - FOLLOW_UP_DAYS);

  const [paymentRaw, bookingRaw, followUpRaw, lowSessionRaw] = await Promise.all([
    canSeePayments ? fetchPayments(storeFilter) : Promise.resolve([]),
    fetchTodayBookings(storeFilter, todayBookingDate),
    fetchFollowUps(storeFilter, todayBookingDate, cutoff),
    fetchLowSessions(storeFilter),
  ]);

  const payments: StoreTodoItem[] = paymentRaw.map((tx) => ({
    id: `payment:${tx.id}`,
    type: "PAYMENT",
    label: TYPE_LABEL.PAYMENT,
    message: `${tx.customer?.name ?? "未知顧客"} 有一筆 NT$ ${Number(
      tx.amount
    ).toLocaleString()} 收款待確認`,
    href: "/dashboard/payments",
    actionLabel: "確認收款",
    priority: TYPE_PRIORITY.PAYMENT,
  }));

  const bookings: StoreTodoItem[] = bookingRaw.map((b) => ({
    id: `booking:${b.id}`,
    type: "BOOKING",
    label: TYPE_LABEL.BOOKING,
    message: `${b.slotTime} ${b.customer.name} 今天有預約，記得完成服務紀錄`,
    href: "/dashboard/bookings",
    actionLabel: "查看預約",
    priority: TYPE_PRIORITY.BOOKING,
  }));

  const followUps: StoreTodoItem[] = followUpRaw.map((c) => ({
    // key 內嵌 lastBookingDate：顧客再次回訪 → 日期變 → key 變 →
    // 舊 dismiss 自動失效 → 重新提醒（「狀態改變才再出現」）
    id: `followup:${c.customerId}:${c.lastBookingDate}`,
    type: "FOLLOW_UP",
    label: TYPE_LABEL.FOLLOW_UP,
    message: `${c.name} 已 ${c.daysSince} 天沒回來，可以提醒安排下一次`,
    href: `/dashboard/customers/${c.customerId}`,
    actionLabel: "查看顧客",
    priority: TYPE_PRIORITY.FOLLOW_UP,
  }));

  const lowSessions: StoreTodoItem[] = lowSessionRaw.map((c) => ({
    // key 內嵌 activeWalletToken：補堂 / 換新錢包 → token 變 → key 變 →
    // 舊 dismiss 自動失效 → 重新提醒
    id: `lowsessions:${c.customerId}:${c.walletToken}`,
    type: "LOW_SESSIONS",
    label: TYPE_LABEL.LOW_SESSIONS,
    message: `${c.name} 剩 ${c.remaining} 堂，適合安排續約或下次預約`,
    href: `/dashboard/customers/${c.customerId}`,
    actionLabel: "查看顧客",
    priority: TYPE_PRIORITY.LOW_SESSIONS,
  }));

  const allItems = [...payments, ...bookings, ...followUps, ...lowSessions];

  // 過濾掉當前 user 已 dismiss 的項目（per-user；只查本批 key，避免 table 長期累積拖慢）
  const allKeys = allItems.map((i) => i.id);
  const dismissedRows =
    allKeys.length > 0
      ? await prisma.todoDismiss.findMany({
          where: { userId: user.id, todoKey: { in: allKeys } },
          select: { todoKey: true },
        })
      : [];
  const dismissedSet = new Set(dismissedRows.map((r) => r.todoKey));
  const visibleItems = allItems.filter((i) => !dismissedSet.has(i.id));

  const deduped = dedupeByCustomer(visibleItems);
  deduped.sort((a, b) => a.priority - b.priority);

  return {
    items: deduped.slice(0, MAX_DISPLAY),
    total: deduped.length,
  };
}

// ============================================================
// fetchers
// ============================================================

type StoreFilter = ReturnType<typeof getStoreFilter>;

async function fetchPayments(storeFilter: StoreFilter) {
  return prisma.transaction.findMany({
    where: {
      ...storeFilter,
      paymentStatus: "PENDING",
      paymentMethod: { in: ["TRANSFER", "UNPAID"] as PaymentMethod[] },
      status: { notIn: ["CANCELLED", "REFUNDED", "VOIDED"] as const },
    },
    select: {
      id: true,
      amount: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: PER_TYPE_FETCH,
  });
}

async function fetchTodayBookings(
  storeFilter: StoreFilter,
  todayBookingDate: Date
) {
  return prisma.booking.findMany({
    where: {
      ...storeFilter,
      bookingDate: todayBookingDate,
      bookingStatus: { in: ["PENDING", "CONFIRMED"] as const },
    },
    select: {
      id: true,
      slotTime: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { slotTime: "asc" },
    take: PER_TYPE_FETCH,
  });
}

async function fetchFollowUps(
  storeFilter: StoreFilter,
  todayBookingDate: Date,
  cutoff: Date
) {
  // 候選：未合併、有 ACTIVE 錢包（且 remainingSessions > 0）、無未來 PENDING/CONFIRMED 預約
  const candidates = await prisma.customer.findMany({
    where: {
      ...storeFilter,
      mergedIntoCustomerId: null,
      planWallets: {
        some: { status: "ACTIVE", remainingSessions: { gt: 0 } },
      },
      bookings: { some: { bookingStatus: "COMPLETED" } },
      NOT: {
        bookings: {
          some: {
            bookingStatus: { in: ["PENDING", "CONFIRMED"] as const },
            bookingDate: { gte: todayBookingDate },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      bookings: {
        where: { bookingStatus: "COMPLETED" },
        orderBy: { bookingDate: "desc" },
        take: 1,
        select: { bookingDate: true },
      },
    },
    take: FOLLOW_UP_CANDIDATE_LIMIT,
  });

  return candidates
    .map((c) => {
      const lastBooking = c.bookings[0];
      if (!lastBooking) return null;
      if (lastBooking.bookingDate.getTime() > cutoff.getTime()) return null;
      const daysSince = Math.floor(
        (todayBookingDate.getTime() - lastBooking.bookingDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      // DB date 欄位讀出後 toISOString().slice(0,10) 是安全用法（date-time-rules 例外）
      const lastBookingDate = lastBooking.bookingDate
        .toISOString()
        .slice(0, 10);
      return { customerId: c.id, name: c.name, daysSince, lastBookingDate };
    })
    .filter(
      (
        x
      ): x is {
        customerId: string;
        name: string;
        daysSince: number;
        lastBookingDate: string;
      } => x !== null
    )
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, PER_TYPE_FETCH);
}

async function fetchLowSessions(storeFilter: StoreFilter) {
  // 取所有 ACTIVE 錢包 + 該錢包的 AVAILABLE session 數，再按顧客加總
  const wallets = await prisma.customerPlanWallet.findMany({
    where: {
      ...storeFilter,
      status: "ACTIVE",
      customer: { mergedIntoCustomerId: null },
    },
    select: {
      id: true,
      customer: { select: { id: true, name: true } },
      sessions: {
        where: { status: "AVAILABLE" },
        select: { id: true },
      },
    },
  });

  const byCustomer = new Map<
    string,
    { name: string; remaining: number; walletIds: string[] }
  >();
  for (const w of wallets) {
    const cur = byCustomer.get(w.customer.id) ?? {
      name: w.customer.name,
      remaining: 0,
      walletIds: [],
    };
    cur.remaining += w.sessions.length;
    cur.walletIds.push(w.id);
    byCustomer.set(w.customer.id, cur);
  }

  return [...byCustomer.entries()]
    .filter(([, v]) => v.remaining <= LOW_SESSIONS_THRESHOLD)
    .map(([customerId, v]) => ({
      customerId,
      name: v.name,
      remaining: v.remaining,
      // 該顧客目前所有 ACTIVE 錢包 id 排序後串接 — 錢包組成變更（補堂 / 換錢包）
      // → token 變 → todoKey 變 → 舊 dismiss 失效 → 重新提醒
      walletToken: v.walletIds.slice().sort().join("+"),
    }))
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, PER_TYPE_FETCH);
}

// ============================================================
// dedupe
// ============================================================

function dedupeByCustomer(items: StoreTodoItem[]): StoreTodoItem[] {
  // PAYMENT 用 tx.id 為 key（無 customerId 可知，不跨型別合併）
  // 其餘以 customerId 為 key，跨型別保留 priority 最小的那筆
  const paymentItems = items.filter((i) => i.type === "PAYMENT");
  const others = items.filter((i) => i.type !== "PAYMENT");

  const bestByCustomer = new Map<string, StoreTodoItem>();
  for (const item of others) {
    const cid = customerIdFromTodoId(item.id);
    if (!cid) {
      bestByCustomer.set(item.id, item);
      continue;
    }
    const existing = bestByCustomer.get(cid);
    if (!existing || item.priority < existing.priority) {
      bestByCustomer.set(cid, item);
    }
  }

  return [...paymentItems, ...bestByCustomer.values()];
}
