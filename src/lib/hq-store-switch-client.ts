import { switchActiveStore } from "@/server/actions/store-switch";
import type { ActionResult } from "@/types";

export async function switchHqStoreView(storeId: string): Promise<ActionResult<void>> {
  try {
    // A Server Action posts to the current route, which the preview write
    // boundary deliberately blocks. Use the viewing-only route from HQ's selector.
    if (window.location.pathname !== "/hq/dashboard/frontend-preview") {
      return await switchActiveStore(storeId);
    }
    const response = await fetch("/api/hq/store-view", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const result = await response.json();
    if (typeof result?.success === "boolean") return result;
  } catch { /* Preserve the current view and report a recoverable failure. */ }
  return { success: false, error: "切換店舖失敗，請再試一次" };
}
