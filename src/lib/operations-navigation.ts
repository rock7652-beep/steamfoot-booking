export const OPERATIONS_AREAS = [
  { id: "ledger", label: "營收明細" },
  { id: "income", label: "收入分類" },
  { id: "cashbook", label: "現金帳" },
  { id: "monthly", label: "月結管理" },
  { id: "exports", label: "報表匯出" },
] as const;
export type OperationsArea = typeof OPERATIONS_AREAS[number]["id"];
export type OperationsQuery = Record<string, string | undefined>;
export function operationsArea(value?: string): OperationsArea {
  if (value === "fees") return "monthly";
  return OPERATIONS_AREAS.find(area => area.id === value)?.id ?? "ledger";
}
/** Share dates and scope, never leak one table's status/page into another tab. */
export function operationsHref(area: OperationsArea, query: OperationsQuery = {}, beautyLedger = false) {
  const next = new URLSearchParams();
  for (const key of ["dateFrom", "dateTo", "month", "dataScope"])
    if (query[key]) next.set(key, query[key]!);
  if (area !== "ledger") next.set("area", area);
  if ((area === "monthly" || area === "cashbook") && !next.has("month") && /^\d{4}-\d{2}-\d{2}$/.test(query.dateTo ?? ""))
    next.set("month", query.dateTo!.slice(0, 7));
  if (beautyLedger && area === "ledger") next.set("tab", "營運");
  const path = beautyLedger && area === "ledger" ? "/dashboard/beauty" : "/dashboard/revenue";
  return `${path}${next.size ? `?${next}` : ""}`;
}
/** Old URLs retain their own filters while moving to the shared workspace. */
export function legacyOperationsHref(area: OperationsArea, query: OperationsQuery = {}) {
  const next = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
  next.delete("tab"); next.set("area", area);
  return `/dashboard/revenue?${next}`;
}

/** Keep the current store namespace instead of falling back to the actor's home store. */
export function scopedOperationsHref(href:string,pathname:string) {
  const prefix=pathname.match(/^(\/s\/[^/?#]+\/admin|\/hq)\/dashboard(?:\/|$)/)?.[1]??"";
  return `${prefix}${href}`;
}

/** Resolve retired entrypoints before the App Router renders a page tree. */
export function legacyOperationsDestination(pathname:string,query:URLSearchParams) {
  const match=pathname.match(/^(\/dashboard|\/hq\/dashboard|\/s\/[^/?#]+\/admin\/dashboard)\/(cashbook|service-fee-calculator|store-revenue|data-export|reconciliation)\/?$/);
  if(!match)return null;
  const next=new URLSearchParams(query),entry=match[2];
  next.set("area",entry==="cashbook"||entry==="reconciliation"?"cashbook":entry==="service-fee-calculator"?"monthly":"exports");
  if(entry==="store-revenue"||entry==="data-export")next.set("reportView",entry==="store-revenue"?"overview":"data");
  if(entry==="reconciliation")next.set("checks","1");
  return `${match[1]}/revenue?${next}`;
}
