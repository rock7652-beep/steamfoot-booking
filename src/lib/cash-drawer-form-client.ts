import type { ActionResult } from "@/types";

/** Keep the uncertain receipt visible; never retry a financial request with a new key automatically. */
export async function postCashDrawerForm<T>(pathname: string, kind: "CASHBOOK" | "CLOSE" | "REOPEN", form: FormData): Promise<ActionResult<T>> {
  form.set("kind", kind);
  try {
    const endpoint = `${pathname.split("/dashboard")[0]}/dashboard/cash-drawer/save`;
    const response = await fetch(endpoint, { method: "POST", body: form, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (typeof result?.success !== "boolean" || (!result.success && typeof result.error !== "string")) throw new Error("Invalid receipt");
    return result;
  } catch {
    return { success: false, error: "尚未確認儲存結果，請先重新整理核對；補登重試會沿用同一次送出。" };
  }
}
