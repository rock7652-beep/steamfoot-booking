import type { getCustomerDrawerDetailAction } from "@/server/actions/customer";

// Restore only typed date fields; a note containing an ISO date remains text.
function restoreDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreDates);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "string" && /(?:At|Date)$|^(?:date|birthday)$/.test(key)
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item)
      ? new Date(item) : restoreDates(item),
  ]));
}

export async function readCustomerDrawerPrimary(customerId: string): Promise<Awaited<ReturnType<typeof getCustomerDrawerDetailAction>>> {
  const prefix = window.location.pathname.split("/dashboard")[0];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${prefix}/dashboard/customers/primary-read?customerId=${encodeURIComponent(customerId)}`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new Error("顧客資料暫時無法載入");
    const result = await response.json();
    if (typeof result?.success !== "boolean") throw new Error("顧客資料讀取失敗");
    return restoreDates(result) as Awaited<ReturnType<typeof getCustomerDrawerDetailAction>>;
  } finally {
    clearTimeout(timeout);
  }
}
