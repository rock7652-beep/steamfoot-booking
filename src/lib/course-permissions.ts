import type { PermissionCode } from "./permissions";

/** Course controls expose only capabilities implemented in this module. */
export const COURSE_PERMISSIONS: readonly PermissionCode[] = [
  "customer.read",
  "customer.create",
  "customer.update",
  "booking.read",
  "booking.create",
  "booking.update",
  "wallet.read",
  "wallet.create",
  "plans.edit",
  "business_hours.view",
  "business_hours.manage",
  "report.read",
  "cashbook.read",
  "cashbook.create",
  "cashDrawer.read",
  "cashDrawer.open",
  "cashDrawer.close",
  "cashDrawer.entry",
  "staff.view",
  "staff.manage",
];
export const COURSE_PERMISSION_LABELS: Partial<Record<PermissionCode, string>> =
  {
    "wallet.read": "查看點數方案與共卡",
    "wallet.create": "指派方案與管理共卡",
    "booking.update": "修改／取消排課、預約及點名",
    "business_hours.view": "查看店家與預約規則",
    "business_hours.manage": "修改店家與預約規則",
  };
