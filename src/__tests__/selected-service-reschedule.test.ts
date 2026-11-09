import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), raw: vi.fn(),
  aggregate: vi.fn(), groupBy: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  booking: { findFirst: mocks.findFirst, findUnique: mocks.findFirst, updateMany: mocks.updateMany, groupBy: mocks.groupBy },
  shopConfig: { findUnique: vi.fn(async () => ({ bookableUntilDate: "2026-12-31" })) },
  $queryRaw: mocks.raw, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: vi.fn(async () => ({ rule: { closed: false }, slotOverrides: [], dateObj: new Date("2026-11-05T00:00:00Z") })),
  applySlotOverrides: vi.fn(() => [{ startTime: "14:00", isEnabled: true, capacity: 4 }]),
}));
vi.mock("@/lib/shop-config", () => ({ isDutySchedulingEnabled: vi.fn(async () => false), resolveBookableUntilDate: () => "2026-12-31" }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(async () => ({ role: "CUSTOMER" })) }));
vi.mock("@/lib/customer-booking-eligibility", () => ({ requireCustomerBookingEligibility: vi.fn(async () => ({ customerId: "customer", storeId: "store" })) }));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: vi.fn() }));
vi.mock("@/lib/store-operating-status", () => ({ isStoreBookable: vi.fn(async () => true) }));
vi.mock("@/lib/subscription-guard", () => ({ isStoreSubscriptionWriteBlocked: vi.fn(async () => false) }));

import { loadSelectedBookingServices, selectedBookingServiceName, selectedServicesCoverDate, type SelectedBookingService } from "@/server/services/booking-service-selection";
import { createTrialBookingActionToken, getTrialBookingManagementStatus, listTrialRescheduleSlots, rescheduleTrialBooking, cancelTrialBooking } from "@/server/services/trial-booking-self-service";
import { rescheduleCustomerBooking } from "@/server/actions/customer-booking-reschedule";
import { buildTrialBookingReminderLineMessages } from "@/server/services/trial-booking-reminder-line-message";

const now = new Date("2026-11-02T00:00:00Z");
const booking = { customerId: "customer", bookingType: "FIRST_TRIAL", isMakeup: false, customerPlanWallet: null, walletSessions: [], id: "booking", storeId: "store", bookingDate: new Date("2026-11-03T00:00:00Z"), slotTime: "14:00", people: 1, bookingStatus: "PENDING", customerRescheduleCount: 0, customerConfirmedAt: null };
const packageService: SelectedBookingService = {
  service: "PACKAGE_SESSION", status: "PENDING", arrivedAt: null, collectionTransactionId: null,
  walletSessionId: "reserved-session", sessionStatus: "RESERVED", walletStatus: "ACTIVE",
  startDate: new Date("2026-11-01T00:00:00Z"), expiryDate: new Date("2026-11-06T00:00:00Z"),
};
let services: SelectedBookingService[];
let token: string;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "true");
  vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-only-secret");
  token = createTrialBookingActionToken(booking, now);
  services = [{ ...packageService }];
  mocks.findFirst.mockImplementation(async () => ({ ...booking }));
  mocks.aggregate.mockResolvedValue({ _sum: { people: 0 } });
  mocks.groupBy.mockResolvedValue([]);
  mocks.raw.mockImplementation(async (query: TemplateStringsArray) => query.join("").includes("SELECT p.service") ? services : [{ acquired: 1 }]);
  mocks.transaction.mockImplementation(async fn => fn({
    $queryRaw: mocks.raw,
    booking: { findFirst: mocks.findFirst, findUnique: mocks.findFirst, update: mocks.update, aggregate: mocks.aggregate },
    shopConfig: { findUnique: vi.fn(async () => ({ bookableUntilDate: "2026-12-31" })) },
  }));
});

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("original trial reservations with an actual package selection", () => {
  it("projects the actual service to the signed page and LINE card without changing the reservation", async () => {
    const status = await getTrialBookingManagementStatus(token, now);
    expect(status?.serviceName).toBe("方案預約");
    const card = buildTrialBookingReminderLineMessages({ customerName: "測試顧客", bookingDate: "2026-11-03", bookingTime: "14:00", shopName: "測試店", serviceName: status!.serviceName }, "https://example.com/trial-booking/manage?token=test");
    expect(JSON.stringify(card)).toContain("方案預約");
    expect(JSON.stringify(card)).not.toContain("首次體驗");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("changes only time and reschedule metadata, preserving the reserved package session", async () => {
    expect(await rescheduleTrialBooking(token, "2026-11-05", "14:00", now)).toBe("rescheduled");
    expect(mocks.update).toHaveBeenCalledOnce();
    const write = mocks.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: booking.id });
    expect(write.data.bookingDate).toEqual(new Date("2026-11-05T00:00:00Z"));
    expect(Object.keys(write.data).sort()).toEqual(["bookingDate", "customerConfirmedAt", "customerRescheduleCount", "customerRescheduledAt", "originalBookingDate", "originalSlotTime", "slotTime"].sort());
    expect(services[0].walletSessionId).toBe("reserved-session");
  });

  it("does not offer or save a date outside the selected package validity", async () => {
    expect(await listTrialRescheduleSlots(token, "2026-11-07", now)).toEqual([]);
    expect(await rescheduleTrialBooking(token, "2026-11-07", "14:00", now)).toBe("unavailable");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechecks a package changed between slot selection and transaction", async () => {
    mocks.transaction.mockImplementation(async fn => {
      services = [{ ...packageService, walletStatus: "EXPIRED" }];
      return fn({ $queryRaw: mocks.raw, booking: { findFirst: mocks.findFirst, update: mocks.update, aggregate: mocks.aggregate } });
    });
    expect(await rescheduleTrialBooking(token, "2026-11-05", "14:00", now)).toBe("unavailable");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("never uses wallet-free cancellation for a selected package", async () => {
    expect(await cancelTrialBooking(token, now)).toBe("unavailable");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("requires every participant's entitlement and keeps mixed service names", () => {
    const trial = { ...packageService, service: "FIRST_TRIAL", walletSessionId: null };
    expect(selectedBookingServiceName([packageService, trial], "FIRST_TRIAL")).toBe("方案預約＋首次體驗");
    expect(selectedServicesCoverDate([packageService, trial], "2026-11-06")).toBe(true);
    expect(selectedServicesCoverDate([packageService, { ...packageService, expiryDate: new Date("2026-11-04T00:00:00Z") }], "2026-11-05")).toBe(false);
    expect(selectedServicesCoverDate([{ ...packageService, sessionStatus: "AVAILABLE" }], "2026-11-05")).toBe(false);
    expect(selectedServicesCoverDate([{ ...packageService, collectionTransactionId: "receipt" }], "2026-11-05")).toBe(false);
    expect(selectedServicesCoverDate([packageService], "2026-10-31")).toBe(false);
  });

  it("the authenticated customer route edits the same original trial booking with its selected package", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    expect(await rescheduleCustomerBooking(booking.id, "2026-11-05", "14:00")).toBe("rescheduled");
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: booking.id });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("bookingType");
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("customerPlanWalletId");
  });

  it("does not query participant tables when the feature is disabled", async () => {
    vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "false");
    expect(await loadSelectedBookingServices(booking)).toEqual([]);
    expect(mocks.raw).not.toHaveBeenCalled();
    expect(selectedBookingServiceName([], "FIRST_TRIAL")).toBe("首次體驗");
  });
});
