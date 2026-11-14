import type { CustomerPanelSummary } from "@/server/actions/customer-panel-summary";
import type { ActionResult } from "@/types";

/** Independent read so a slow summary cannot queue the next customer's primary action. */
export async function readCustomerPanelSummary(customerId: string, signal?: AbortSignal): Promise<ActionResult<CustomerPanelSummary>> {
  const prefix = window.location.pathname.split("/dashboard")[0];
  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 15_000) : undefined;
  try {
  const response = await fetch(`${prefix}/dashboard/customers/summary-read?customerId=${encodeURIComponent(customerId)}`, {
    credentials: "same-origin", cache: "no-store", signal: signal ?? controller!.signal,
  });
  if (!response.ok) throw new Error("摘要暫時無法載入");
  const result: ActionResult<CustomerPanelSummary> = await response.json();
  if (result.success && result.data.next) result.data.next.date = new Date(result.data.next.date);
  return result;
  } finally {
    clearTimeout(timeout);
  }
}
