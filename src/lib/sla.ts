/**
 * 頁面 SLA（Service Level Agreement）定義
 *
 * 每頁最大可接受 server render 耗時（P95）。
 * ServerTiming.finish() 會自動比對，超標時 log [PERF:SLA_BREACH]。
 *
 * tier:
 *  - instant: 0-100ms（快取/snapshot 直接回傳）
 *  - fast:    100-200ms（skeleton 短暫閃現後替換）
 *  - acceptable: 200-400ms（允許較長 skeleton 顯示）
 */

export type SlaTier = "instant" | "fast" | "acceptable";

export interface PageSla {
  targetMs: number;
  tier: SlaTier;
}

export const PAGE_SLA: Record<string, PageSla> = {
  "/dashboard": { targetMs: 200, tier: "fast" },
  "/dashboard/bookings": { targetMs: 200, tier: "fast" },
  "/dashboard/customers": { targetMs: 200, tier: "fast" },
  "/dashboard/customers/[id]": { targetMs: 300, tier: "acceptable" },
  "/dashboard/reports": { targetMs: 100, tier: "instant" },
  "/dashboard/duty": { targetMs: 200, tier: "fast" },
  "/dashboard/reconciliation": { targetMs: 200, tier: "fast" },
};

/**
 * 取得頁面對應的 SLA target
 * 支援動態路由 match（/dashboard/customers/xxx → /dashboard/customers/[id]）
 */
export function getSla(page: string): PageSla | undefined {
  // 精確匹配
  if (PAGE_SLA[page]) return PAGE_SLA[page];
  // 動態路由：/dashboard/customers/xxx → /dashboard/customers/[id]
  const dynamicMatch = page.replace(/\/[a-zA-Z0-9_-]{10,}$/, "/[id]");
  return PAGE_SLA[dynamicMatch];
}
