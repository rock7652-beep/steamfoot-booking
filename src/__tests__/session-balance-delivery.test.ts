import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
  updateMany: vi.fn(), update: vi.fn(), wallets: vi.fn(),
  push: vi.fn(), centralPush: vi.fn(), route: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  sessionBalanceNotification: m,
  customerPlanWallet: { findMany: m.wallets },
} }));
vi.mock("@/lib/line", () => ({ pushMessage: m.push, pushSteamButlerMessage: m.centralPush }));
vi.mock("@/server/services/manager-notification-delivery", () => ({ deliverManagerNotification: vi.fn() }));
vi.mock("@/server/services/central-line-recipient-loader", () => ({ resolveCentralLineRecipientForCustomer: vi.fn() }));
vi.mock("@/server/services/verified-reminder-line-route", () => ({ resolveVerifiedReminderLineRoute: m.route }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://example.test" }));

import { dispatchSessionBalanceNotifications, retrySessionBalanceNotifications } from "@/server/services/session-balance-notifications";

function record() {
  return {
    id: "n1", storeId: "s1", customerId: "c1", walletId: "w1", type: "PLAN_USED_UP",
    status: "PENDING", deliveryVersion: 1, deliveryAttempts: 0,
    retryUntil: new Date(Date.now() + 60_000), deliverySnapshot: null,
    customer: { name: "Test", lineUserId: "u1", lineLinkStatus: "LINKED" },
    wallet: { plan: { name: "Test plan" }, sessions: [] },
    store: { slug: "test", sessionBalanceNotificationSetting: null },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  m.findUnique.mockResolvedValue(record()); m.findFirst.mockResolvedValue(record());
  m.updateMany.mockResolvedValue({ count: 1 }); m.update.mockResolvedValue({});
  m.wallets.mockResolvedValue([]); m.push.mockResolvedValue({ success: true });
  m.route.mockResolvedValue({ status: "READY", channel: "STORE", recipientLineUserId: "u1" });
});
afterEach(() => vi.unstubAllEnvs());

describe("durable session balance delivery", () => {
  it("persists a snapshot before sending with a stable UUID retry key", async () => {
    await dispatchSessionBalanceNotifications(["n1", "n1"]);
    expect(m.push).toHaveBeenCalledTimes(1);
    expect(m.push.mock.calls[0][3]).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(m.update.mock.calls[0][0].data.deliverySnapshot.recipient).toBe("u1");
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.push.mock.invocationCallOrder[0]);
  });
  it("does not send after another worker wins the lease", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    { retryUntil: new Date(0) }, { deliveryAttempts: 5 }, { status: "SENT" },
  ])("does not retry expired, exhausted or sent rows: %j", async (override) => {
    m.findUnique.mockResolvedValue({ ...record(), ...override });
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.push).not.toHaveBeenCalled();
  });
  it("preserves frozen content on retry", async () => {
    const messages = [{ type: "text", text: "original" }];
    m.findFirst.mockResolvedValue({ ...record(), deliverySnapshot: { channel: "STORE", recipient: "u1", body: "original", messages } });
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.push.mock.calls[0][2]).toEqual(messages);
  });
  it("does not switch recipients or channels on retry", async () => {
    m.findFirst.mockResolvedValue({ ...record(), deliverySnapshot: { channel: "CENTRAL", recipient: "old", body: "original", messages: [] } });
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }));
  });
  it("retains a failed delivery for later retry and releases its lease", async () => {
    m.push.mockRejectedValue(new Error("private detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
    expect(m.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { leaseUntil: null } }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private detail");
    log.mockRestore();
  });
  it("never dispatches from preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await dispatchSessionBalanceNotifications(["n1"]);
    expect(m.findUnique).not.toHaveBeenCalled(); expect(m.push).not.toHaveBeenCalled();
  });
  it("recovery is bounded and excludes legacy, SPA and course rows", async () => {
    m.findMany.mockResolvedValue([]);
    await retrySessionBalanceNotifications();
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 5, where: expect.objectContaining({ deliveryVersion: 1, store: { industryModule: "STEAMFOOT" }, deliveryAttempts: { lt: 5 } }),
    }));
  });
});
