import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/app/(liff)/liff/liff-shell.tsx", "utf8");
const bookings = readFileSync("src/app/(liff)/liff/bookings/bookings-list.tsx", "utf8");
const wallets = readFileSync("src/app/(liff)/liff/wallets/wallets-list.tsx", "utf8");
const spaAction = readFileSync("src/server/actions/spa-liff-member.ts", "utf8");

describe("SPA LIFF member routing isolation", () => {
  it("uses the SPA projections for the homepage and both details", () => {
    expect(shell).toContain('memberDataSource === "spa"');
    expect(shell).toContain("fetchSpaLiffBookings()");
    expect(shell).toContain("fetchSpaLiffEntitlements()");
    expect(bookings).toContain('dataSource === "spa"');
    expect(wallets).toContain('dataSource === "spa"');
  });

  it("keeps SPA booking actions away from the legacy write path", () => {
    expect(bookings).toContain("cancelSpaCustomerBooking");
    expect(bookings).toContain("/book/new");
    expect(wallets).not.toContain('dataSource === "spa" ? `/s/${storeSlug}/liff/member-booking`');
  });

  it("reads only SpaBooking and SpaEntitlement for SPA member records", () => {
    expect(spaAction).toContain("spaPrisma.spaBooking.findMany");
    expect(spaAction).toContain("spaPrisma.spaEntitlement.findMany");
    expect(spaAction).not.toContain("prisma.booking");
    expect(spaAction).not.toContain("customerPlanWallet");
    expect(spaAction).not.toContain("prisma.transaction");
  });
});
