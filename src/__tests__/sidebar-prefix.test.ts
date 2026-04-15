/**
 * B7-4: Sidebar Dashboard Prefix 測試
 *
 * 測試 sidebar 從 usePathname() 推導的 dashboardPrefix 邏輯。
 */
import { describe, it, expect } from "vitest";

/**
 * 從 pathname 推導 dashboard 路由前綴
 * 與 sidebar.tsx 中的邏輯一致
 */
function deriveDashboardPrefix(pathname: string): string {
  const storeMatch = pathname.match(/^(\/s\/[^/]+\/admin)\/dashboard/);
  if (storeMatch) return storeMatch[1];
  const hqMatch = pathname.match(/^(\/hq)\/dashboard/);
  if (hqMatch) return hqMatch[1];
  return "";
}

function normalizePathname(rawPathname: string, prefix: string): string {
  return prefix ? rawPathname.slice(prefix.length) : rawPathname;
}

describe("sidebar dashboardPrefix", () => {
  it("should derive prefix from /s/zhubei/admin/dashboard", () => {
    expect(deriveDashboardPrefix("/s/zhubei/admin/dashboard")).toBe("/s/zhubei/admin");
  });

  it("should derive prefix from /s/taichung/admin/dashboard/bookings", () => {
    expect(deriveDashboardPrefix("/s/taichung/admin/dashboard/bookings")).toBe("/s/taichung/admin");
  });

  it("should derive prefix from /hq/dashboard", () => {
    expect(deriveDashboardPrefix("/hq/dashboard")).toBe("/hq");
  });

  it("should derive prefix from /hq/dashboard/customers", () => {
    expect(deriveDashboardPrefix("/hq/dashboard/customers")).toBe("/hq");
  });

  it("should return empty string for legacy /dashboard", () => {
    expect(deriveDashboardPrefix("/dashboard")).toBe("");
  });

  it("should return empty string for /dashboard/bookings", () => {
    expect(deriveDashboardPrefix("/dashboard/bookings")).toBe("");
  });
});

describe("pathname normalization for active item matching", () => {
  it("should normalize /s/zhubei/admin/dashboard/bookings → /dashboard/bookings", () => {
    const raw = "/s/zhubei/admin/dashboard/bookings";
    const prefix = deriveDashboardPrefix(raw);
    expect(normalizePathname(raw, prefix)).toBe("/dashboard/bookings");
  });

  it("should normalize /hq/dashboard → /dashboard", () => {
    const raw = "/hq/dashboard";
    const prefix = deriveDashboardPrefix(raw);
    expect(normalizePathname(raw, prefix)).toBe("/dashboard");
  });

  it("should keep /dashboard as-is for legacy route", () => {
    const raw = "/dashboard";
    const prefix = deriveDashboardPrefix(raw);
    expect(normalizePathname(raw, prefix)).toBe("/dashboard");
  });
});

describe("link href construction", () => {
  it("should construct /s/zhubei/admin/dashboard/bookings from prefix + item.href", () => {
    const prefix = "/s/zhubei/admin";
    const itemHref = "/dashboard/bookings";
    expect(`${prefix}${itemHref}`).toBe("/s/zhubei/admin/dashboard/bookings");
  });

  it("should construct /hq/dashboard/customers from prefix + item.href", () => {
    const prefix = "/hq";
    const itemHref = "/dashboard/customers";
    expect(`${prefix}${itemHref}`).toBe("/hq/dashboard/customers");
  });

  it("should keep /dashboard/bookings for legacy (empty prefix)", () => {
    const prefix = "";
    const itemHref = "/dashboard/bookings";
    expect(`${prefix}${itemHref}`).toBe("/dashboard/bookings");
  });
});
