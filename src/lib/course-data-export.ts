import { DATA_EXPORT_STATUS_OPTIONS, type DataExportType } from "./data-export-labels";

export const COURSE_EXPORT_LABELS: Record<DataExportType, string> = {
  customers: "顧客資料", transactions: "課程購買與退款", bookings: "課程預約與出席", wallets: "課程方案與額度",
};
export const COURSE_EXPORT_STATUSES = {
  customers: DATA_EXPORT_STATUS_OPTIONS.customers,
  transactions: [{ value: "PENDING", label: "待核帳" }, { value: "CONFIRMED", label: "已核帳" }, { value: "REFUNDED", label: "已登錄退款" }, { value: "VOIDED", label: "已作廢" }],
  bookings: [{ value: "RESERVED", label: "待上課／已報到" }, { value: "ATTENDED", label: "已出席" }, { value: "NO_SHOW", label: "未到" }, { value: "CANCELLED", label: "已取消" }],
  wallets: [{ value: "ACTIVE", label: "有效" }, { value: "EXPIRED", label: "已到期" }, { value: "CLOSED", label: "已結清停用" }],
} satisfies Record<DataExportType, ReadonlyArray<{ value: string; label: string }>>;
export const COURSE_EXPORT_PERIOD_LABELS: Record<DataExportType, string> = {
  customers: "顧客建立期間", transactions: "購買登錄／退款發生期間（分頁列示，非營收加總）", bookings: "上課日期期間", wallets: "發卡日期期間",
};
export function courseExportStatusLabel(type: DataExportType, status: string) {
  return COURSE_EXPORT_STATUSES[type].find(option => option.value === status)?.label ?? "需核對";
}
