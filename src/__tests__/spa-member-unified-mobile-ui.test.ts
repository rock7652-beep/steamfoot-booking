import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("SPA member unified mobile UI", () => {
  it("removes the functional rail only for SPA member pages", () => {
    const layout = read("src/app/(customer)/layout.tsx");
    const returnLink = read("src/app/(customer)/spa-member-return-link.tsx");

    expect(layout).toContain('const isSpaMemberPortal = industryModule === "spa"');
    expect(layout).toContain("!isSpaMemberPortal && <aside");
    expect(layout).toContain("SpaMemberReturnLink");
    expect(returnLink).toContain("usePathname");
    expect(returnLink).toContain("返回會員專區");
    expect(layout).toContain("<MobileNav");
  });

  it("uses one identity switcher in member and work modes", () => {
    const switcher = read("src/components/spa-identity-mode-switcher.tsx");
    const member = read("src/app/(liff)/liff/liff-shell.tsx");
    const work = read("src/app/(liff)/liff/spa-work/staff-work-screen.tsx");

    expect(switcher).toContain("會員專區");
    expect(switcher).toContain("我的工作");
    expect(member).toContain('activeMode="member"');
    expect(work).toContain('activeMode="work"');
  });

  it("refreshes the selected work date when LINE returns to the foreground", () => {
    const work = read("src/app/(liff)/liff/spa-work/staff-work-screen.tsx");

    expect(work).toContain("load(selectedDateRef.current)");
    expect(work).toContain('document.addEventListener("visibilitychange", refresh)');
    expect(work).toContain('window.addEventListener("pageshow", refresh)');
    expect(work).toContain('window.addEventListener("focus", refresh)');
    expect(work).toContain("lastResumeRefreshAtRef");
  });

  it("progressively reveals compact booking steps and auto-loads slots", () => {
    const form = read(
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
    );

    expect(form).toContain('["服務", "日期時間", "人員", "確認"]');
    expect(form).toContain("loadAvailability(nextDate)");
    expect(form).not.toContain("查詢時段");
    expect(form).toContain("上午");
    expect(form).toContain("下午");
    expect(form).toContain("晚上");
    expect(form).toContain("fixed inset-x-0 bottom-0");
    expect(form).toContain("<StepSummary");
  });

  it("keeps SPA reads and writes on independent actions", () => {
    const home = read("src/app/(customer)/book/page.tsx");
    const form = read(
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
    );

    expect(home).toContain("fetchSpaLiffBookings");
    expect(home).toContain("fetchSpaLiffEntitlements");
    expect(form).toContain("createSpaCustomerBooking");
    expect(form).toContain("fetchSpaCustomerAvailability");
    expect(form).toContain("cancelSpaCustomerBooking");
  });

  it("allows the same SPA detail pages from an authenticated web session", () => {
    const bookingsPage = read("src/app/(liff)/liff/bookings/page.tsx");
    const bookingsList = read("src/app/(liff)/liff/bookings/bookings-list.tsx");
    const walletsPage = read("src/app/(liff)/liff/wallets/page.tsx");
    const walletsList = read("src/app/(liff)/liff/wallets/wallets-list.tsx");

    expect(bookingsPage).toContain("allowBrowserSession={Boolean(webUser)}");
    expect(walletsPage).toContain("allowBrowserSession={Boolean(webUser)}");
    expect(bookingsList).toContain('dataSource !== "spa"');
    expect(walletsList).toContain('dataSource !== "spa"');
    expect(bookingsList).toContain("← 返回會員專區");
    expect(walletsList).toContain("← 返回會員專區");
  });
});
