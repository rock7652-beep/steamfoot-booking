import type { getCustomerDrawerDetailAction } from "@/server/actions/customer";

// Only restore direct model fields. Nested progress.date is intentionally text.
function restoreModelDates<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "string" && /(?:At|Date)$|^birthday$/.test(key)
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item)
      ? new Date(item) : item,
  ])) as T;
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
    const typed = result as Awaited<ReturnType<typeof getCustomerDrawerDetailAction>>;
    if (!typed.success) return typed;
    const data = typed.data;
    return { ...typed, data: {
      ...restoreModelDates(data),
      planWallets: data.planWallets.map(restoreModelDates),
      ...(data.bookings ? { bookings: data.bookings.map(restoreModelDates) } : {}),
      recentConsumption: data.recentConsumption?.map(row => ({ ...row, date: new Date(row.date) })) ?? null,
    } };
  } finally {
    clearTimeout(timeout);
  }
}
