/**
 * staff-settlement — 店長服務費試算（PR-2）
 *
 * 純讀取查詢，依日期區間 + 可選 staff 篩選列出店長完成服務次數。
 * 金額（單次服務費 × 次數）由前端 client component 即時計算，這支
 * query 不收 feePerSession 參數，也不入庫。
 *
 * 規則（對應 docs/staff-settlement-phase1-spec.md §3）：
 *   - 只統計 bookingStatus = COMPLETED
 *   - 依 Booking.revenueStaffId 歸屬（PR-1.5a 鎖定的快照）
 *   - revenueStaffId = null → 歸店家（彙總表會列為 "(歸店家)"，金額永遠 $0）
 *   - isMakeup = true 補課也計入服務費，但明細與彙總會分開顯示
 *   - serviceStaffId 只回給 UI 當參考，**不**作為結算歸屬依據
 *
 * 安全：
 *   - 沿用 `getManagerReadFilter` 多店 + manager 可視範圍。
 *   - PARTNER（SELF_ONLY）已被 baseFilter 綁定到自己 revenueStaffId，
 *     前端的 staffId 篩選**不可**覆蓋此限制（防止透過 URL 看他人資料）。
 *
 * 本檔不寫入任何資料。沒有 create / update / delete / upsert。
 */

import { BookingType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getManagerReadFilter } from "@/lib/manager-visibility";

export const UNASSIGNED_STAFF_TOKEN = "__unassigned__";

export interface SettlementSummaryRow {
  /** null 代表歸店家 */
  staffId: string | null;
  /** 顯示名稱；歸店家為 "(歸店家)" */
  staffName: string;
  /** isMakeup = false 的 COMPLETED booking 數 */
  regularCount: number;
  /** isMakeup = true 的 COMPLETED booking 數 */
  makeupCount: number;
  /** regular + makeup */
  totalCount: number;
}

export interface SettlementDetailRow {
  bookingId: string;
  bookingDate: Date;
  slotTime: string;
  customerName: string;
  bookingType: BookingType;
  isMakeup: boolean;
  /** null 代表歸店家 */
  revenueStaffId: string | null;
  /** 顯示名稱；歸店家為 "(歸店家)" */
  revenueStaffName: string;
  /** 當天實際服務店長，僅參考，不影響結算歸屬 */
  serviceStaffId: string | null;
  /** 顯示名稱；無值為 "—" */
  serviceStaffName: string;
  /** revenueStaffId !== null 才計入店長服務費 */
  counted: boolean;
}

export interface PreviewStaffSettlementInput {
  /** YYYY-MM-DD（含當日） */
  startDate: string;
  /** YYYY-MM-DD（含當日） */
  endDate: string;
  /**
   * 可選 staff 篩選：
   *   - undefined → 全部（受 manager 可視範圍限制）
   *   - UNASSIGNED_STAFF_TOKEN → 只看歸店家（revenueStaffId IS NULL）
   *   - cuid → 只看該店長的
   *
   * 注意：PARTNER（SELF_ONLY）的 manager visibility 已綁定到自己，
   * 即使從 URL 傳 staffId=另一人，server 仍以 manager filter 為準。
   */
  staffId?: string;
  /** 多店 scope；undefined / null 走 user.storeId */
  activeStoreId?: string | null;
}

export interface PreviewStaffSettlementResult {
  summary: SettlementSummaryRow[];
  details: SettlementDetailRow[];
}

/**
 * 試算店長服務費（read-only）。
 */
export async function previewStaffSettlement(
  input: PreviewStaffSettlementInput,
): Promise<PreviewStaffSettlementResult> {
  const user = await requireStaffSession();

  // YYYY-MM-DD 轉成台灣時區的當日 00:00 / 23:59:59
  // 既有 monthRange / dateRangeBounds 都採同樣 boundary 邏輯；這裡 input 已是
  // 日期字串（無時區），直接套 UTC 邊界即可，因為 Booking.bookingDate 是 @db.Date。
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

  // 套 staffId 篩選 **只在** baseFilter 沒有已綁定 revenueStaffId 時。
  // 防 PARTNER 透過 URL 把自己的 manager filter 蓋掉看別人資料。
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
      customer: { select: { name: true } },
      revenueStaff: { select: { id: true, displayName: true } },
      serviceStaff: { select: { id: true, displayName: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });

  // 明細
  const details: SettlementDetailRow[] = bookings.map((b) => ({
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
    counted: b.revenueStaffId !== null,
  }));

  // 彙總：依 revenueStaffId 分組
  const summaryMap = new Map<string | null, SettlementSummaryRow>();
  for (const b of bookings) {
    const key = b.revenueStaffId;
    let row = summaryMap.get(key);
    if (!row) {
      row = {
        staffId: key,
        staffName: b.revenueStaff?.displayName ?? "(歸店家)",
        regularCount: 0,
        makeupCount: 0,
        totalCount: 0,
      };
      summaryMap.set(key, row);
    }
    if (b.isMakeup) row.makeupCount++;
    else row.regularCount++;
    row.totalCount++;
  }

  // 排序：店長（依 totalCount desc） → 歸店家放最下面（語意上「最後檢查項」）
  const summary: SettlementSummaryRow[] = [...summaryMap.values()].sort((a, b) => {
    if (a.staffId === null && b.staffId !== null) return 1;
    if (b.staffId === null && a.staffId !== null) return -1;
    return b.totalCount - a.totalCount;
  });

  return { summary, details };
}
