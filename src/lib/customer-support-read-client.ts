import type { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
import type { loadMemberConnectionAction } from "@/server/actions/store-member-connection";

async function read(kind: "connection" | "advanced", customerId: string): Promise<unknown> {
  // Preserve /s/{slug}/admin and /hq so the proxy applies the same store view
  // as the page that opened the customer panel.
  const path = window.location.pathname;
  const prefix = path.match(/^\/s\/[^/]+\/admin(?=\/|$)/)?.[0]
    ?? (path.startsWith("/hq/") ? "/hq" : "");
  const query = new URLSearchParams({ kind, customerId });
  const response = await fetch(`${prefix}/dashboard/customer-support-read?${query}`, {
    credentials: "same-origin", cache: "no-store",
  });
  if (!response.ok) throw new Error("顧客資料讀取失敗，請重試");
  return response.json();
}

export async function readMemberConnection(customerId: string): Promise<Awaited<ReturnType<typeof loadMemberConnectionAction>>> {
  return await read("connection", customerId) as Awaited<ReturnType<typeof loadMemberConnectionAction>>;
}

export async function readCustomerPanelAdvanced(customerId: string): Promise<Awaited<ReturnType<typeof getCustomerPanelAdvanced>>> {
  const result = await read("advanced", customerId) as Awaited<ReturnType<typeof getCustomerPanelAdvanced>>;
  if (!result.success) return result;
  // JSON transports dates as strings; the existing LINE editor expects Date.
  const customer = result.data.customer;
  return { ...result, data: { ...result.data, customer: {
    ...customer,
    lineLinkedAt: customer.lineLinkedAt ? new Date(customer.lineLinkedAt) : null,
    lineBindingCodeCreatedAt: customer.lineBindingCodeCreatedAt ? new Date(customer.lineBindingCodeCreatedAt) : null,
    followUps: customer.followUps.map(row => ({ ...row, createdAt: new Date(row.createdAt) })),
  } } };
}
