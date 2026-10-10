import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookings: vi.fn(),
  facts: vi.fn(), individual: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findMany: (...args: unknown[]) => mocks.bookings(...args) },
  },
}));
vi.mock("@/server/queries/booking-participant-facts", () => ({ loadIndividualBookingFacts: mocks.individual }));
vi.mock("@/server/queries/conversion-metrics", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/queries/conversion-metrics")>(), loadConversionFacts: mocks.facts,
}));

import { getTrialSourceMetrics } from "@/server/queries/trial-source-metrics";

beforeEach(() => {
  mocks.bookings.mockReset();
  mocks.facts.mockReset(); mocks.individual.mockReset();
  mocks.individual.mockResolvedValue({ groupIds: new Set(), visits: [] });
});

describe("trial booking source outcomes", () => {
  it("uses attendance people and identifiable plan customers without inferring login source", async () => {
    mocks.bookings.mockResolvedValue([
      { id: "line-1", customerId: "c1", bookingSource: "LINE", bookingDate: new Date("2026-09-15"), createdAt: new Date("2026-09-10"), bookingStatus: "COMPLETED", people: 2, attendedPeople: 1 },
      { id: "google-1", customerId: "c2", bookingSource: "GOOGLE_MAPS", bookingDate: new Date("2026-09-20"), createdAt: new Date("2026-09-12"), bookingStatus: "PENDING", people: 1, attendedPeople: null },
      { id: "other-1", customerId: "c3", bookingSource: null, bookingDate: new Date("2026-09-18"), createdAt: new Date("2026-09-11"), bookingStatus: "COMPLETED", people: 1, attendedPeople: null },
    ]);
    mocks.facts.mockResolvedValue({ trials: [
      { id: "line-1", customerId: "c1", bookingDate: new Date("2026-09-15") },
      { id: "other-1", customerId: "c3", bookingDate: new Date("2026-09-18") },
    ], purchases: [
      { customerId: "c1", transactionDate: new Date("2026-09-16"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 },
      { customerId: "c3", transactionDate: new Date("2026-09-01"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 },
    ] });

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
    expect(mocks.facts).toHaveBeenCalledWith("store-1", expect.any(Array));
  });
  it("counts a completed companion before the group resolves, but does not count a friend's or fully refunded purchase", async () => {
    mocks.bookings.mockResolvedValue([{ id: "group", customerId: "primary", bookingSource: "LINE", bookingDate: new Date("2026-09-15"), createdAt: new Date("2026-09-10"), bookingStatus: "PENDING", people: 2, attendedPeople: 1 }]);
    mocks.individual.mockResolvedValue({ groupIds: new Set(["group"]), visits: [
      { bookingId: "group", customerId: "guest", bookingType: "FIRST_TRIAL", source: "RESERVATION" },
      { bookingId: "group", customerId: "walk-in", bookingType: "FIRST_TRIAL", source: "WALK_IN" },
    ] });
    mocks.facts.mockResolvedValue({ trials: [{ bookingId: "group", customerId: "guest", bookingDate: new Date("2026-09-15") }], purchases: [
      { customerId: "primary", transactionDate: new Date("2026-10-01"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 },
      { customerId: "guest", transactionDate: new Date("2026-10-01"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 0 },
    ] });
    expect((await getTrialSourceMetrics("store-1", "2026-09-01", "2026-09-30")).find(row => row.source === "LINE")).toMatchObject({ attendees: 1, attendanceRate: 50, assignedCustomers: 0, planRate: 0 });
    mocks.facts.mockResolvedValue({ trials: [{ bookingId: "group", customerId: "guest", bookingDate: new Date("2026-09-15") }], purchases: [
      { customerId: "guest", transactionDate: new Date("2026-10-01"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 },
    ] });
    expect((await getTrialSourceMetrics("store-1", "2026-09-01", "2026-09-30")).find(row => row.source === "LINE")).toMatchObject({ assignedCustomers: 1, planRate: 100 });
  });
  it("does not attribute a repeated trial under another source as a second conversion", async () => {
    mocks.bookings.mockResolvedValue([{ id: "repeat", customerId: "guest", bookingSource: "LINE", bookingDate: new Date("2026-09-15"), createdAt: new Date("2026-09-10"), bookingStatus: "COMPLETED", people: 1, attendedPeople: 1 }]);
    mocks.facts.mockResolvedValue({ trials: [
      { id: "original", customerId: "guest", bookingDate: new Date("2026-08-15") },
      { id: "repeat", customerId: "guest", bookingDate: new Date("2026-09-15") },
    ], purchases: [{ customerId: "guest", transactionDate: new Date("2026-10-01"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 }] });
    expect((await getTrialSourceMetrics("store-1", "2026-09-01", "2026-09-30")).find(row => row.source === "LINE")).toMatchObject({ assignedCustomers: 0, planRate: 0 });
  });
  it("keeps the source attendance denominator at the original two reservations after two walk-ins", async () => {
    mocks.bookings.mockResolvedValue([{ id: "mixed", customerId: "cardholder", bookingSource: "LINE", bookingDate: new Date("2026-09-15"), createdAt: new Date("2026-09-10"), bookingStatus: "COMPLETED", people: 4, attendedPeople: 3 }]);
    mocks.individual.mockResolvedValue({ groupIds: new Set(["mixed"]), originalPeopleByBooking: new Map([["mixed", 2]]), visits: [
      { bookingId: "mixed", customerId: "cardholder", bookingType: "PACKAGE_SESSION", source: "RESERVATION" },
      { bookingId: "mixed", customerId: "trial-guest", bookingType: "FIRST_TRIAL", source: "RESERVATION" },
      { bookingId: "mixed", customerId: "walk-in", bookingType: "FIRST_TRIAL", source: "WALK_IN" },
    ] });
    mocks.facts.mockResolvedValue({ trials: [{ bookingId: "mixed", customerId: "walk-in", bookingDate: new Date("2026-09-15") }], purchases: [
      { customerId: "walk-in", transactionDate: new Date("2026-09-16"), customerPlanWallet: { status: "ACTIVE" }, netAmount: 5990 },
    ] });
    expect((await getTrialSourceMetrics("store-1", "2026-09-01", "2026-09-30")).find(row => row.source === "LINE")).toMatchObject({ bookings: 1, bookedPeople: 2, attendees: 1, attendanceRate: 50, assignedCustomers: 0, planRate: 0 });
  });
});
