import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

const m = vi.hoisted(() => ({ info: vi.fn(), find: vi.fn(), update: vi.fn(), bookingUpdate: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/line", () => ({ getLineBotInfo: m.info }));
vi.mock("@/lib/db", () => ({ prisma: {
  customer: { findFirst: m.find, updateMany: m.update },
  $transaction: m.transaction,
} }));
import { prepareTrialNotificationSetup, claimTrialNotificationSetup } from "@/server/services/trial-notification-binding";

const input = { storeId: "store", customerId: "customer", bookingId: "booking", customerCreated: true, linked: false };
const token = "ab".repeat(32);
const now = new Date("2026-09-19T03:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  m.info.mockResolvedValue({ ok: true, data: { basicId: "@store" } });
  m.update.mockResolvedValue({ count: 1 });
  m.find.mockResolvedValueOnce({ id: "customer" }).mockResolvedValue(null);
  m.transaction.mockImplementation(fn => fn({ customer: { findFirst: m.find, updateMany: m.update }, booking: { updateMany: m.bookingUpdate } }));
});

describe("public trial notification capability", () => {
  it("keeps linked customers free of additional steps", async () => {
    expect(await prepareTrialNotificationSetup({ ...input, linked: true })).toEqual({ status: "linked" });
    expect(m.info).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("never issues a capability for a phone-matched existing customer", async () => {
    expect(await prepareTrialNotificationSetup({ ...input, customerCreated: false })).toEqual({ status: "needs_help" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.info).not.toHaveBeenCalled();
  });
  it("stores only a digest and builds a store-specific encoded message", async () => {
    const result = await prepareTrialNotificationSetup(input);
    expect(result.status).toBe("pending");
    if (result.status !== "pending") throw new Error("missing setup link");
    const url = new URL(result.url);
    expect(url.pathname).toBe("/R/oaMessage/%40store/");
    const message = decodeURIComponent(url.search.slice(1));
    expect(message).toMatch(/^體驗通知 [a-f0-9]{64}$/);
    const raw = message.slice(5);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "customer", storeId: "store", userId: null, lineUserId: null, lineBindingCode: null, mergedIntoCustomerId: null,
        bookings: { some: { id: "booking", storeId: "store", bookingType: "FIRST_TRIAL", bookingStatus: { in: ["PENDING", "CONFIRMED"] } } } }),
      data: expect.objectContaining({ lineBindingCode: `trial:${createHash("sha256").update(raw).digest("hex")}` }),
    }));
    expect(JSON.stringify(m.update.mock.calls)).not.toContain(raw);
  });
  it.each(["bot_failure", "db_failure", "no_match"])("does not fail the reservation when setup fails: %s", async failure => {
    if (failure === "bot_failure") m.info.mockResolvedValue({ ok: false });
    if (failure === "db_failure") m.update.mockRejectedValue(new Error("db down"));
    if (failure === "no_match") m.update.mockResolvedValue({ count: 0 });
    expect(await prepareTrialNotificationSetup(input)).toEqual({ status: "needs_help" });
  });
});

describe("store-signed webhook claim", () => {
  it("consumes once, scopes to store and TTL, never changes login identity", async () => {
    expect(await claimTrialNotificationSetup("store", "Unew", token, now)).toBe("linked");
    expect(m.find).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ storeId: "store", lineUserId: null, userId: null, mergedIntoCustomerId: null,
      lineBindingCodeCreatedAt: { gt: new Date("2026-09-18T03:00:00Z"), lte: now } }) }));
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store", lineUserId: null, userId: null, lineBindingCode: expect.stringMatching(/^trial:/) }),
      data: { lineUserId: "Unew", lineLinkStatus: "LINKED", lineLinkedAt: now, lineBindingCode: null, lineBindingCodeCreatedAt: null },
    }));
    expect(m.bookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", customerId: "customer", bookingType: "FIRST_TRIAL", trialBookingChannel: null }), data: { trialBookingChannel: "LINE" } }));
  });
  it("rejects malformed tokens before database access", async () => {
    expect(await claimTrialNotificationSetup("store", "Unew", "ABC123", now)).toBe("invalid");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejects absent/expired/consumed/wrong-store capabilities", async () => {
    m.find.mockReset().mockResolvedValue(null);
    expect(await claimTrialNotificationSetup("other-store", "Unew", token, now)).toBe("invalid");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not move an existing LINE owner", async () => {
    m.find.mockReset().mockResolvedValueOnce({ id: "customer" }).mockResolvedValueOnce({ id: "other" });
    expect(await claimTrialNotificationSetup("store", "Unew", token, now)).toBe("conflict");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not report success after losing an atomic claim", async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect(await claimTrialNotificationSetup("store", "Unew", token, now)).toBe("invalid");
    expect(m.bookingUpdate).not.toHaveBeenCalled();
  });
  it("handles a concurrent identity collision without overwriting", async () => {
    m.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2002", clientVersion: "test" }));
    expect(await claimTrialNotificationSetup("store", "Unew", token, now)).toBe("conflict");
  });
  it("returns a retryable failure for database outages", async () => {
    m.transaction.mockRejectedValue(new Error("unavailable"));
    expect(await claimTrialNotificationSetup("store", "Unew", token, now)).toBe("unavailable");
  });
});
