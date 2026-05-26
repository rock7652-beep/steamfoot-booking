/**
 * Trial follow-up query — getTrialFollowUpList
 *
 * 列出「已體驗收款但尚未購買方案」的顧客。
 * 純讀，不寫 DB；不依賴 `customerStage` 是否為 TRIAL（候選 A 還沒做時也能用）。
 *
 * 規則（per 前置 audit）：
 *   - Transaction.transactionType = TRIAL_PURCHASE
 *   - Transaction.status = SUCCESS（排除 VOIDED / REFUNDED）
 *   - Customer.convertedAt IS NULL（未轉方案）
 *   - Customer.mergedIntoCustomerId IS NULL（排除已合併）
 *   - Customer.user.status != SUSPENDED（排除停用）
 *   - store isolation 走 getStoreFilter
 *   - 同一顧客多筆 SUCCESS TRIAL → 只取最近一筆 paidAt
 *   - 排序：paidAt DESC（最近收款的最上面）
 *   - take 200 上限保護（prod 目前 5 筆；不做 pagination）
 *
 * 不在此 query 處理：
 *   - 顯示文字格式化（M/D、距今天數）→ caller / UI 端
 *   - 電話遮罩（末 4 碼）→ UI 端，本 query 仍回完整 phone 由 caller 決定遮罩
 */

import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";

type SessionLike = {
  role: string;
  storeId?: string | null;
  staffId?: string | null;
};

export interface TrialFollowUpFilters {
  /** 距今天數上限；undefined = 不限 */
  withinDays?: number;
  /** 指定直屬店長 id；undefined = 全部 */
  assignedStaffId?: string;
}

export interface TrialFollowUpRow {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerStage: string; // 顯示用；UI 不強調，僅 debug
  /** Booking.bookingDate（體驗預約日）；可能 null 如果 trial 沒連 booking（prod 0 筆） */
  trialBookingDate: Date | null;
  /** Transaction.paidAt（體驗收款日）；prod 全部非 null */
  trialPaidAt: Date | null;
  /** Transaction.createdAt fallback（paidAt 為 null 時排序兜底） */
  trialCreatedAt: Date;
  trialAmount: number;
  trialPaymentMethod: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffColor: string | null;
}

/**
 * 取得「已體驗未轉方案」清單。
 *
 * @param user session-like object (role / storeId / staffId)
 * @param activeStoreId  ADMIN 切店視角；非 ADMIN 忽略
 * @param filters        withinDays / assignedStaffId
 */
export async function getTrialFollowUpList(
  user: SessionLike,
  activeStoreId: string | null,
  filters: TrialFollowUpFilters = {},
): Promise<TrialFollowUpRow[]> {
  const storeFilter = getStoreFilter(user, activeStoreId);

  // Step 1: groupBy customer → 最近一筆 SUCCESS TRIAL_PURCHASE paidAt
  // 排除條件 attach 在 customer relation filter；store isolation 同層
  const cutoffDate =
    filters.withinDays != null
      ? new Date(Date.now() - filters.withinDays * 24 * 60 * 60 * 1000)
      : null;

  const groups = await prisma.transaction.groupBy({
    by: ["customerId"],
    where: {
      transactionType: "TRIAL_PURCHASE",
      status: "SUCCESS",
      ...storeFilter,
      customer: {
        convertedAt: null,
        mergedIntoCustomerId: null,
        // 排除停用 — relation filter；user 為 null 也算「未綁定登入帳號」，仍可顯示
        NOT: { user: { is: { status: "SUSPENDED" } } },
        ...(filters.assignedStaffId
          ? { assignedStaffId: filters.assignedStaffId }
          : {}),
      },
      ...(cutoffDate ? { paidAt: { gte: cutoffDate } } : {}),
    },
    _max: { paidAt: true, createdAt: true },
  });

  if (groups.length === 0) return [];

  // Step 2: 反查最近一筆 SUCCESS TRIAL_PURCHASE 完整資料
  // dedupe by (customerId, paidAt) — paidAt 為 null 時用 createdAt 兜底
  const orConds = groups.map((g) => ({
    customerId: g.customerId,
    paidAt: g._max.paidAt,
    ...(g._max.paidAt == null ? { createdAt: g._max.createdAt ?? undefined } : {}),
  }));

  const rows = await prisma.transaction.findMany({
    where: {
      transactionType: "TRIAL_PURCHASE",
      status: "SUCCESS",
      ...storeFilter,
      OR: orConds,
    },
    select: {
      id: true,
      amount: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
      booking: { select: { bookingDate: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          customerStage: true,
          assignedStaffId: true,
          assignedStaff: {
            select: { id: true, displayName: true, colorCode: true },
          },
        },
      },
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  // 去除可能殘留的重複 customerId（同 paidAt 多筆 — 防禦性）
  const seen = new Set<string>();
  const result: TrialFollowUpRow[] = [];
  for (const r of rows) {
    if (seen.has(r.customer.id)) continue;
    seen.add(r.customer.id);
    result.push({
      customerId: r.customer.id,
      customerName: r.customer.name ?? "(未命名)",
      customerPhone: r.customer.phone ?? null,
      customerStage: r.customer.customerStage,
      trialBookingDate: r.booking?.bookingDate ?? null,
      trialPaidAt: r.paidAt ?? null,
      trialCreatedAt: r.createdAt,
      trialAmount: Number(r.amount),
      trialPaymentMethod: r.paymentMethod,
      assignedStaffId: r.customer.assignedStaffId,
      assignedStaffName: r.customer.assignedStaff?.displayName ?? null,
      assignedStaffColor: r.customer.assignedStaff?.colorCode ?? null,
    });
  }

  return result;
}

/**
 * 列出當下「已體驗未轉方案」清單中出現過的直屬店長（給 UI 篩選下拉用）。
 * 不取全店 staff 清單以免顯示不相關選項。
 */
export async function getTrialFollowUpStaffOptions(
  user: SessionLike,
  activeStoreId: string | null,
): Promise<Array<{ id: string; displayName: string }>> {
  const rows = await getTrialFollowUpList(user, activeStoreId, {});
  const seen = new Set<string>();
  const opts: Array<{ id: string; displayName: string }> = [];
  for (const r of rows) {
    if (!r.assignedStaffId || !r.assignedStaffName) continue;
    if (seen.has(r.assignedStaffId)) continue;
    seen.add(r.assignedStaffId);
    opts.push({ id: r.assignedStaffId, displayName: r.assignedStaffName });
  }
  opts.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return opts;
}
