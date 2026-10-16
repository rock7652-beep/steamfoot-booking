import { isMusicPreviewPage, publishMusicFinanceChange } from "./music-finance-sync";
export type MusicMutationResult = { success: boolean; error?: string };
/** Fixed URL and versioned JSON contract avoid deployment-pinned Server Action IDs.
 * Never retry a payment automatically: callers retain their original idempotency key.
 */
export async function musicCheckoutTransport(
  operation: "purchase" | "receipt", input: unknown,
  fallback: (input: unknown) => Promise<MusicMutationResult>,
): Promise<MusicMutationResult> {
  if (!isMusicPreviewPage()) return fallback(input);
  try {
    const response = await fetch("/s/lubymusic/admin/dashboard/music-checkout", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Music-Contract": "1" },
      body: JSON.stringify({ operation, input }),
    });
    if (response.status === 409) return { success: false, error: "系統已更新，尚未送出；輸入仍保留，請開啟最新版後核對再送出。" };
    const result = await response.json();
    if (typeof result?.success !== "boolean") throw new Error("Unexpected checkout response");
    if (result.success) publishMusicFinanceChange();
    return result;
  } catch {
    return { success: false, error: "尚未確認收款結果，輸入已保留；請用相同資料重試，系統會防止重複收款。" };
  }
}
