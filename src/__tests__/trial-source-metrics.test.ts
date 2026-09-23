import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookings: vi.fn(),
  wallets: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findMany: (...args: unknown[]) => mocks.bookings(...args) },
    customerPlanWallet: { findMany: (...args: unknown[]) => mocks.wallets(...args) },
  },
}));

import { getTrialSourceMetrics } from "@/server/queries/trial-source-metrics";

beforeEach(() => {
  mocks.bookings.mockReset();
  mocks.wallets.mockReset();
});

describe("trial booking source outcomes", () => {
  it("uses attendance people and identifiable plan customers without inferring login source", async () => {
    mocks.bookings.mockResolvedValue([
      { id: "line-1", customerId: "c1", bookingSource: "LINE", bookingDate: new Date("2026-09-15"), createdAt: new Date("2026-09-10"), bookingStatus: "COMPLETED", people: 2, attendedPeople: 1 },
      { id: "google-1", customerId: "c2", bookingSource: "GOOGLE_MAPS", bookingDate: new Date("2026-09-20"), createdAt: new Date("2026-09-12"), bookingStatus: "PENDING", people: 1, attendedPeople: null },
      { id: "other-1", customerId: "c3", bookingSource: null, bookingDate: new Date("2026-09-18"), createdAt: new Date("2026-09-11"), bookingStatus: "COMPLETED", people: 1, attendedPeople: null },
    ]);
    mocks.wallets.mockResolvedValue([
      { customerId: "c1", createdAt: new Date("2026-09-16") },
      { customerId: "c3", createdAt: new Date("2026-09-01") },
    ]);

    const rows = await getTrialSourceMetrics("store-1", "2026-09-01", "2026-09-30");
    expect(rows.find((row) => row.source === "LINE")).toMatchObject({
      bookings: 1, bookedPeople: 2, attendees: 1, attendanceRate: 50,
      assignedCustomers: 1, planRate: 100,
    });
    expect(rows.find((row) => row.source === "GOOGLE_MAPS")).toMatchObject({
      bookings: 1, bookedPeople: 1, attendees: 0, assignedCustomers: 0, planRate: 0,
    });
    expect(rows.find((row) => row.source === "OTHER")).toMatchObject({
      bookings: 1, attendees: 1, assignedCustomers: 0,
    });
    for (const source of ["LINE", "GOOGLE_MAPS", "OTHER"]) {
      expect(rows.find((row) => row.source === source)?.sourceShare).toBeCloseTo(100 / 3);
    }
    expect(mocks.wallets).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", status: { not: "CANCELLED" }, plan: { category: "PACKAGE" } }),
    }));
  });
});
