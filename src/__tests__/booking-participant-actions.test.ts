import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  permission: vi.fn(), writable: vi.fn(), store: vi.fn(), module: vi.fn(), subscription: vi.fn(),
  booking: vi.fn(), search: vi.fn(), existing: vi.fn(), count: vi.fn(), create: vi.fn(),
  init: vi.fn(), link: vi.fn(), limit: vi.fn(), usage: vi.fn(), revalidate: vi.fn(), transaction: vi.fn(),
  settings: vi.fn(), collect: vi.fn(), resolve: vi.fn(), event: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission, requireWritablePermission: h.writable }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: h.store }));
vi.mock("@/lib/industry-module-server", () => ({ requireSteamfootStore: h.module }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: h.subscription }));
vi.mock("@/lib/shop-config", () => ({ checkCustomerLimit: h.limit, getTrialSettings: h.settings }));
vi.mock("@/lib/usage-gate", () => ({ checkCustomerLimitOrThrow: h.usage }));
vi.mock("@/lib/booking-route-mutation", () => ({ revalidateBookingMutation: h.revalidate, revalidateBookingTransactionMutation: h.revalidate }));
vi.mock("@/server/services/booking-participant-payment", () => ({ collectParticipantTrialInTransaction: h.collect, resolveUnattendedParticipant: h.resolve }));
vi.mock("@/server/services/referral-events", () => ({ createBookingCompletedEvent: h.event }));
vi.mock("@/server/services/booking-participants", () => ({ initializeBookingParticipants: h.init, linkBookingParticipantCustomer: h.link }));
vi.mock("@/lib/db", () => ({ prisma: {
  booking: { findFirst: h.booking }, customer: { findMany: h.search, findFirst: h.existing }, $transaction: h.transaction,
} }));
import { attachBookingCompanion, createBookingCompanion, findBookingCompanionByPhone, collectBookingParticipantTrial, resolveBookingParticipant } from "@/server/actions/booking-participants";
import { AppError } from "@/lib/errors";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "true");
  h.writable.mockResolvedValue({ storeId: "untrusted-default" }); h.store.mockResolvedValue("authorized-store");
  h.booking.mockResolvedValue({ id: "booking" }); h.search.mockResolvedValue([{ id: "guest", name: "同行者", phone: "0912345678" }]);
  h.limit.mockResolvedValue({ allowed: true }); h.count.mockResolvedValue(10); h.existing.mockResolvedValue(null);
  h.create.mockResolvedValue({ id: "new", name: "新朋友" });
  h.settings.mockResolvedValue({ trialDefaultPrice: 499 });
  h.collect.mockResolvedValue({ transactionId: "receipt", bookingId: "booking", customerId: "guest", created: true });
  h.init.mockResolvedValue([{ id: "slot", position: 2, source: "RESERVATION", customerId: null, status: "PENDING", revision: 1 }]);
  h.transaction.mockImplementation(async work => work({ customer: { findFirst: h.existing, count: h.count, create: h.create } }));
});

describe("individual settlement action boundaries", () => {
  const payment = { bookingId: "booking", position: 2, revision: 1, amount: 499, paymentMethod: "CASH" as const };
  it("requires trial and booking write permissions before accessing payment data", async () => {
    h.writable.mockImplementation(async permission => {
      if (permission === "trial.confirm") throw new AppError("FORBIDDEN", "無收款權限");
      return {};
    });
    expect((await collectBookingParticipantTrial(payment)).success).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled(); expect(h.settings).not.toHaveBeenCalled();
  });
  it("collects the selected actual person inside the authorized store and emits one personal completion", async () => {
    expect(await collectBookingParticipantTrial(payment)).toEqual({ success: true, data: { transactionId: "receipt" } });
    expect(h.writable).toHaveBeenCalledWith("booking.update");
    expect(h.collect.mock.calls[0][1]).toMatchObject({ storeId: "authorized-store", participantId: "slot", amount: 499, revision: 1 });
    expect(h.event).toHaveBeenCalledWith(expect.objectContaining({ customerId: "guest", storeId: "authorized-store" }));
  });
  it("an identical receipt retry does not emit another completion event", async () => {
    h.collect.mockResolvedValue({ transactionId: "receipt", bookingId: "booking", customerId: "guest", created: false });
    expect((await collectBookingParticipantTrial(payment)).success).toBe(true);
    expect(h.event).not.toHaveBeenCalled();
  });
  it("rejects invalid amounts, position and payment methods before creating receipts", async () => {
    for (const input of [{ ...payment, amount: -1 }, { ...payment, amount: 499.5 }, { ...payment, position: 0 }, { ...payment, paymentMethod: "INVALID" }]) {
      expect((await collectBookingParticipantTrial(input as typeof payment)).success).toBe(false);
    }
    expect(h.collect).not.toHaveBeenCalled(); expect(h.transaction).not.toHaveBeenCalled();
  });
  it("subscription block or disabled rollout cannot settle any participant", async () => {
    h.subscription.mockRejectedValueOnce(new AppError("FORBIDDEN", "訂閱不可寫入"));
    expect((await collectBookingParticipantTrial(payment)).success).toBe(false);
    vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "false");
    expect((await collectBookingParticipantTrial(payment)).success).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("no-show resolves only the requested slot and never calls financial collection", async () => {
    expect((await resolveBookingParticipant({ bookingId: "booking", position: 2, revision: 1, status: "NO_SHOW" })).success).toBe(true);
    expect(h.resolve.mock.calls[0][1]).toMatchObject({ storeId: "authorized-store", participantId: "slot", revision: 1, status: "NO_SHOW" });
    expect(h.collect).not.toHaveBeenCalled(); expect(h.event).not.toHaveBeenCalled();
  });
});
const input = { bookingId: "booking", position: 2, revision: 1, name: "新朋友", phone: "0912345678" };
describe("companion actions authorization and identity", () => {
  it("searches exact normalized phone only in the resolved write store", async () => {
    const result = await findBookingCompanionByPhone({ bookingId: "booking", phone: "0912-345-678" });
    expect(result).toEqual({ success: true, data: [{ id: "guest", name: "同行者", phoneMasked: "0912***678" }] });
    expect(h.search.mock.calls[0][0].where).toEqual({ storeId: "authorized-store", phone: "0912345678", mergedIntoCustomerId: null });
  });
  it("cannot probe a phone through a booking outside the authorized store", async () => {
    h.booking.mockResolvedValue(null);
    expect((await findBookingCompanionByPhone({ bookingId: "foreign", phone: input.phone })).success).toBe(false);
    expect(h.search).not.toHaveBeenCalled();
  });
  it("disabled rollout performs no participant writes", async () => {
    vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "false");
    expect((await attachBookingCompanion({ ...input, customerId: "guest" })).success).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("customer creation permission is required before creating a companion", async () => {
    h.writable.mockImplementation(async permission => {
      if (permission === "customer.create") throw new AppError("FORBIDDEN", "無新增顧客權限");
      return {};
    });
    expect((await createBookingCompanion(input)).success).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("a stale occupied slot cannot create an unused customer", async () => {
    h.init.mockResolvedValue([{ position: 2, source: "RESERVATION", customerId: "other", revision: 2 }]);
    expect((await createBookingCompanion(input)).success).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("existing phone requires explicit selection rather than creating or silently linking", async () => {
    h.existing.mockResolvedValue({ id: "existing" });
    expect((await createBookingCompanion(input)).success).toBe(false);
    expect(h.create).not.toHaveBeenCalled(); expect(h.link).not.toHaveBeenCalled();
  });
  it("new profile and slot assignment share one transaction and the correct store limits", async () => {
    expect(await createBookingCompanion(input)).toEqual({ success: true, data: { customerId: "new", name: "新朋友" } });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
    expect(h.usage).toHaveBeenCalledWith(10, "authorized-store", expect.objectContaining({ customer: expect.any(Object) }));
    expect(h.link.mock.calls[0][1]).toMatchObject({ storeId: "authorized-store", participantId: "slot", customerId: "new" });
  });
});
