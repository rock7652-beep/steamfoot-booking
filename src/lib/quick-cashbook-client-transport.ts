import { isMusicPreviewPage } from "./music-finance-sync";
import type { fetchQuickCashbook } from "@/server/actions/quick-cashbook";

export type QuickCashbookData = Awaited<ReturnType<typeof fetchQuickCashbook>>;

/** Panel reader owns intent deduplication/invalidation; financial reads stay fresh. */
export async function readQuickCashbook(storeId: string, page = 1): Promise<QuickCashbookData> {
  const params = new URLSearchParams({ storeId, page: String(page) });
  const path = isMusicPreviewPage() ? "/s/lubymusic/admin/dashboard/music-cashbook" : "/api/cashbook/quick";
  const response = await fetch(`${path}?${params}`, {
    cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) throw new Error("收支紀錄暫時無法讀取");
  const payload = await response.json();
  const data: QuickCashbookData | undefined = payload?.data;
  if (payload?.storeId !== storeId || !data || data.page !== page
    || !Array.isArray(data.entries) || !Array.isArray(data.closedDates)
    || typeof data.today !== "string" || typeof data.canWrite !== "boolean"
    || typeof data.canDrawer !== "boolean" || !Number.isSafeInteger(data.total) || data.total < 0
    || typeof data.balanceLabel !== "string"
    || (data.balance !== null && !Number.isFinite(data.balance))) {
    throw new Error("收支資料不符，請重新讀取");
  }
  return data;
}
