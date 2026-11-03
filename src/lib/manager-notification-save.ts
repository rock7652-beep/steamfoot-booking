"use client";

/** Validate a scoped receipt before committing optimistic state; no router refresh. */
export async function saveManagerNotification(storeId: string, id: string, key: string, enabled: boolean) {
  const started = performance.now();
  const response = await fetch("/api/settings/manager-notification", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedStoreId: storeId, id, key, enabled }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  console.info("[MANAGER_NOTIFICATION_SAVE_PERF]", {
    responseMs: Math.round(performance.now() - started),
    serverTiming: response.headers.get("Server-Timing"),
    trace: response.headers.get("X-Settings-Trace"),
  });
  if (result.success === false && typeof result.error === "string") return { success: false, error: result.error };
  if (!response.ok || result.success !== true || result.storeId !== storeId || result.data?.id !== id || result.data?.key !== key || result.data?.enabled !== enabled) {
    throw new Error("Unconfirmed notification preference receipt");
  }
  return { success: true };
}
