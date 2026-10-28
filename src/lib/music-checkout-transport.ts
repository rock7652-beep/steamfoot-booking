import {capturePurchaseSnapshotReceiver} from "./music-purchase-snapshot";
import {parseMusicPeriods} from './music-period-read-client';
import { isMusicPreviewPage, publishMusicFinanceChange, publishMusicRevenueCommit } from "./music-finance-sync";
export type MusicMutationResult = { success: boolean;financePublished?:boolean; error?: string; checkoutReceipt?:unknown;checkoutCards?:import('./course-purchase-roster').CoursePurchaseCardsSnapshot;rosterSnapshot?:import('./course-purchase-roster').CoursePurchaseRosterSnapshot };
/** Fixed URL and versioned JSON contract avoid deployment-pinned Server Action IDs.
 * Never retry a payment automatically: callers retain their original idempotency key.
 */
export async function musicCheckoutTransport(
  operation: "purchase" | "receipt", input: unknown,
  fallback: (input: unknown) => Promise<MusicMutationResult>,
): Promise<MusicMutationResult> {
  if (!isMusicPreviewPage()) return fallback(input);
  const acceptSnapshot = operation === "purchase" ? capturePurchaseSnapshotReceiver() : undefined;
  const started=performance.now();
  const token = `${operation}:${crypto.randomUUID()}`;
  let committed = false;
  try {
    const response = await fetch("/s/lubymusic/admin/dashboard/music-checkout", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Music-Contract": "1", "X-Music-Stream": "1" },
      body: JSON.stringify({ operation, input }),
    });
    if (response.status === 409) return { success: false, error: "系統已更新，尚未送出；輸入仍保留，請開啟最新版後核對再送出。" };
    committed = response.ok && operation === "purchase" && response.headers.get("x-music-committed") === "1";
    if (committed) {
      publishMusicRevenueCommit(token);
      console.info("[music-checkout-committed]", JSON.stringify({requestMs:Math.round(performance.now()-started)}));
    }
    const result = await response.json();
    console.info("[music-checkout-response]", JSON.stringify({operation,requestMs:Math.round(performance.now()-started),serverTiming:response.headers.get("server-timing"),phases:response.headers.get("x-music-timing"),readTiming:result.readTiming}));
    if (typeof result?.success !== "boolean") throw new Error("Unexpected checkout response");
    if (result.success) {
      const snapshot = result.snapshot;
      if (operation === "purchase" && snapshot?.overview?.success === true && snapshot?.cards?.success === true && typeof snapshot.customerId === "string") {
        try { if(snapshot.periods)snapshot.periods=parseMusicPeriods(JSON.stringify(snapshot.periods));acceptSnapshot?.(snapshot); } catch { /* Normal authoritative refresh remains available. */ }
      }
      publishMusicFinanceChange(operation, token);
    }
    return result.success?{...result,financePublished:true}:result;
  } catch {
    // The server has already confirmed the write. A disconnected projection must not invite a second payment.
    if (committed) { publishMusicFinanceChange(operation, token); return {success:true,financePublished:true}; }
    return { success: false, error: "尚未確認收款結果，輸入已保留；請用相同資料重試，系統會防止重複收款。" };
  }
}
