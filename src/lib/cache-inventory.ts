/**
 * 全站快取與效能熱點清單
 *
 * 用於 /dashboard/settings/perf 頁面展示，
 * 以及開發時快速查閱快取拓撲。
 */

export interface CacheEntry {
  tag: string;
  ttl: number;
  source: string;
  invalidatedBy: string[];
  consumers: string[];
}

export interface PageHotspot {
  route: string;
  queryCount: number;
  cacheCoverage: "full" | "partial" | "none";
  cacheNote: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  notes: string;
}

export const CACHE_INVENTORY: CacheEntry[] = [
  {
    tag: "business-hours",
    ttl: 60,
    source: "src/lib/duty-cache.ts",
    invalidatedBy: [
      "updateBusinessHours",
      "applyWeeklyTemplate",
    ],
    consumers: ["/dashboard/duty", "/book"],
  },
  {
    tag: "special-days",
    ttl: 60,
    source: "src/lib/duty-cache.ts",
    invalidatedBy: [
      "updateBusinessHours",
      "applyWeeklyTemplate",
      "addSpecialDay",
      "removeSpecialDay",
      "removeSpecialDayByDate",
      "copySettingsToFutureWeeks",
      "toggleSlotOverride",
      "overrideSlotCapacity",
    ],
    consumers: ["/dashboard/duty", "/book"],
  },
  {
    tag: "duty-scheduling",
    ttl: 30,
    source: "src/lib/duty-cache.ts",
    invalidatedBy: ["updateDutyScheduling"],
    consumers: ["/dashboard/duty"],
  },
  {
    tag: "shop-config",
    ttl: 60,
    source: "src/lib/query-cache.ts",
    invalidatedBy: ["updateStorePlan"],
    consumers: ["/dashboard/reports", "/dashboard/reconciliation"],
  },
  {
    tag: "plans",
    ttl: 60,
    source: "src/lib/query-cache.ts",
    invalidatedBy: ["createPlan", "updatePlan", "deletePlan"],
    consumers: ["/dashboard/customers/[id]"],
  },
  {
    tag: "staff",
    ttl: 60,
    source: "src/lib/query-cache.ts",
    invalidatedBy: ["createStaff", "updateStaff", "toggleStaffStatus", "deleteStaff"],
    consumers: ["/dashboard/customers/[id]"],
  },
  {
    tag: "bookings-summary",
    ttl: 30,
    source: "src/lib/revalidation.ts",
    invalidatedBy: [
      "createBooking",
      "updateBooking",
      "cancelBooking",
      "markCompleted",
      "markNoShow",
      "revertBookingStatus",
      "checkInBooking",
    ],
    consumers: ["/dashboard/bookings"],
  },
  {
    tag: "report-store",
    ttl: 120,
    source: "src/lib/revalidation.ts",
    invalidatedBy: [
      "createBooking",
      "updateBooking",
      "cancelBooking",
      "markCompleted",
      "createTransaction",
      "refundTransaction",
      "createAdjustment",
    ],
    consumers: ["/dashboard/reports"],
  },
];

export const PAGE_HOTSPOTS: PageHotspot[] = [
  {
    route: "/dashboard/reports",
    queryCount: 12,
    cacheCoverage: "partial",
    cacheNote: "storePlan cached; storeSummary/revenueByCategory 需 session 無法全快取",
    priority: "HIGH",
    notes: "9 groupBy + 2 groupBy + 1 staff lookup。受 session role 過濾，無法用 unstable_cache 包整個結果。已加 ServerTiming 監控。",
  },
  {
    route: "/dashboard/customers/[id]",
    queryCount: 7,
    cacheCoverage: "partial",
    cacheNote: "plans + staffOptions cached (60s); customerDetail 仍走 DB",
    priority: "HIGH",
    notes: "getCustomerDetail 含 4 nested includes。plans 與 staffOptions 已改用 getCachedPlans / getCachedStaffOptions。",
  },
  {
    route: "/dashboard/bookings",
    queryCount: 3,
    cacheCoverage: "none",
    cacheNote: "需 session + 即時資料，暫不快取",
    priority: "MEDIUM",
    notes: "2 groupBy + 1 staff lookup。已加 ServerTiming 監控。月摘要查詢量可接受。",
  },
  {
    route: "/dashboard/duty",
    queryCount: 5,
    cacheCoverage: "full",
    cacheNote: "businessHours (60s), specialDays (60s), dutyEnabled (30s) 三層快取",
    priority: "LOW",
    notes: "Phase 2 已優化。5 queries 並行 + 相鄰週預取。O(1) 前端查找。updateTag 即時失效。",
  },
  {
    route: "/dashboard/reconciliation",
    queryCount: 3,
    cacheCoverage: "partial",
    cacheNote: "storePlan cached; runs/detail 走 DB",
    priority: "LOW",
    notes: "查詢量低，資料量小。已加 ServerTiming 監控。",
  },
  {
    route: "/dashboard/customers",
    queryCount: 2,
    cacheCoverage: "none",
    cacheNote: "分頁 + 搜尋，需即時資料",
    priority: "LOW",
    notes: "findMany + count 分頁查詢，每頁 20 筆。搜尋用 OR 多欄位比對。",
  },
];
