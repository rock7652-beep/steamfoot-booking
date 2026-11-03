import { getLineAccessTokenForStore, getSteamButlerLineAccessToken } from "./line-config";
import { isPreviewExternalIntegrationBlocked } from "./runtime-env";

export type QuotaSource = "STORE" | "CENTRAL";
import type { LineQuota } from "./line-quota-policy";
export { quotaThreshold, isLineQuotaExceeded } from "./line-quota-policy";
export async function readLineQuota(storeId: string, source: QuotaSource): Promise<LineQuota> {
  if (isPreviewExternalIntegrationBlocked()) throw new Error("預覽環境不查詢外部額度");
  const token = source === "STORE" ? getLineAccessTokenForStore(storeId) : getSteamButlerLineAccessToken();
  if (!token) throw new Error("LINE 額度查詢尚未設定");
  const read = async (path: string) => {
    const response = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`LINE 額度查詢失敗（${response.status}）`);
    return response.json();
  };
  const [quota, consumption] = await Promise.all([read("quota"), read("quota/consumption")]);
  if (!Number.isSafeInteger(consumption.totalUsage) || consumption.totalUsage < 0 ||
      !["limited", "none"].includes(quota.type) ||
      (quota.type === "limited" && (!Number.isSafeInteger(quota.value) || quota.value < 0))) {
    throw new Error("LINE 額度回應格式不正確");
  }
  return { used: consumption.totalUsage, limit: quota.type === "none" ? null : quota.value };
}
