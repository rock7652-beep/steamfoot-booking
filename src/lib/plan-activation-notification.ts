import { toLocalDateStr } from "@/lib/date-utils";

export const PLAN_ACTIVATION_TEMPLATE = "方案開通通知";
export const planActivationSettingId = (storeId: string) => `plan-activation-setting:${storeId}`;
export type PlanActivationSnapshot = {
  storeName: string; customerName: string; planName: string;
  quantity: number; unit: string; expiresDate: string | null;
};
export function planActivationMessage(value: PlanActivationSnapshot) {
  return [value.storeName, `${value.customerName} 您好，您的方案已開通！`,
    `方案：${value.planName}`, `本次開通：${value.quantity} ${value.unit}`,
    `使用期限：${value.expiresDate ?? "無固定到期日，依方案使用規則"}`,
    "可至本店會員專區查看方案及預約。"].join("\n");
}
export function activationExpiry(date: Date | null) {
  return date ? toLocalDateStr(date) : null;
}
