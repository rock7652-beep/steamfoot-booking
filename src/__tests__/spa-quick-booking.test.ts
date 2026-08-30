import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpaQuickAlternatives } from "@/lib/spa-quick-alternatives";

describe("SPA quick booking", () => {
  it("recommends the same time with another provider before moving later", () => {
    expect(
      buildSpaQuickAlternatives({
        requestedProviderId: "staff-10",
        requestedTime: "14:00",
        providers: [
          {
            id: "staff-10",
            displayName: "10號",
            startTimes: ["14:30", "15:00"],
          },
          {
            id: "staff-08",
            displayName: "08號",
            startTimes: ["14:00", "14:30"],
          },
        ],
      }),
    ).toEqual([
      { providerId: "staff-08", providerName: "08號", time: "14:00" },
      { providerId: "staff-10", providerName: "10號", time: "14:30" },
      { providerId: "staff-10", providerName: "10號", time: "15:00" },
    ]);
  });

  it("opens an in-place drawer and keeps booking writes behind the SPA Demo boundary", () => {
    const schedule = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    const action = readFileSync(
      "src/server/actions/spa-quick-booking.ts",
      "utf8",
    );
    expect(schedule).toContain("<SpaQuickBookingDrawer");
    expect(action).toContain("currentStoreId(user) !== SPA_DEMO_STORE.id");
    expect(action).toContain('bookingType: "SINGLE"');
  });

  it("locks 15-minute SPA ranges at the configured granularity", () => {
    const bookingAction = readFileSync("src/server/actions/booking.ts", "utf8");
    expect(bookingAction).toContain(
      "dayCtx.rule.slotInterval === 15 ? 15 : 30",
    );
    expect(bookingAction).toContain("index * spaLockInterval");
  });

  it("keeps on-site checkout inside the SPA Demo boundary", () => {
    const checkout = readFileSync("src/server/actions/spa-checkout.ts", "utf8");
    const drawer = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/collect-single-modal.tsx",
      "utf8",
    );
    expect(checkout).toContain("storeId !== SPA_DEMO_STORE.id");
    expect(checkout).toContain("settleSpaBookingWithPackage");
    expect(checkout).toContain("settleSpaBookingWithStoredValue");
    expect(checkout).toContain('entryType: "DEBIT"');
    expect(checkout).toContain('FOR UPDATE`');
    expect(drawer).toContain("現場結帳");
    expect(drawer).toContain("確認扣儲值金並完成服務");
    expect(drawer).toContain("確認扣次並完成服務");
  });

  it("supports an optional arrival step without completing the booking", () => {
    const checkout = readFileSync("src/server/actions/spa-checkout.ts", "utf8");
    const detail = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "utf8",
    );
    expect(checkout).toContain("checkInSpaBooking");
    expect(checkout).toContain("data: { isCheckedIn: true }");
    expect(detail).toContain("確認到店／開始服務");
  });

  it("keeps stored value as a monetary ledger instead of a service plan", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "prisma/migrations/20260830093000_add_spa_stored_value_wallet/migration.sql",
      "utf8",
    );
    expect(schema).toContain("model StoredValueWallet");
    expect(schema).toContain("model StoredValueLedgerEntry");
    expect(migration).toContain("StoredValueWallet_balance_nonnegative");
    expect(migration).toContain('CREATE UNIQUE INDEX "StoredValueLedgerEntry_bookingId_key"');
  });
});
