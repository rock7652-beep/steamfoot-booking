import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  settings: vi.fn(), setting: vi.fn(), bookings: vi.fn(), booking: vi.fn(), customer: vi.fn(),
  findLog: vi.fn(), createLog: vi.fn(), updateLog: vi.fn(), countLog: vi.fn(),
  prefUpsert: vi.fn(), prefFind: vi.fn(), prefFirst: vi.fn(), prefUpdate: vi.fn(), prefThrow: vi.fn(),
  purchase: vi.fn(), wallets: vi.fn(), future: vi.fn(), messageCount: vi.fn(), messageCreate: vi.fn(),
  config: vi.fn(), push: vi.fn(), probe: vi.fn(), feature: vi.fn(), tx: vi.fn(),
  spaBookings: vi.fn(), spaBooking: vi.fn(), spaSale: vi.fn(), spaFuture: vi.fn(), spaEntitlement: vi.fn(), spaValue: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  trialCareSetting: { findMany: m.settings, findUnique: m.setting },
  booking: { findMany: m.bookings, findFirst: m.booking, count: m.future }, customer: { findFirst: m.customer },
  trialCareLog: { findUnique: m.findLog, create: m.createLog, update: m.updateLog, count: m.countLog },
  trialCarePreference: { upsert: m.prefUpsert, findUnique: m.prefFind, findFirst: m.prefFirst, updateMany: m.prefUpdate, findUniqueOrThrow: m.prefThrow },
  transaction: { count: m.purchase }, customerPlanWallet: { count: m.wallets },
  messageLog: { count: m.messageCount, create: m.messageCreate }, shopConfig: { findUnique: m.config }, $transaction: m.tx,
} }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaBooking: { findMany: m.spaBookings, findFirst: m.spaBooking, count: m.spaFuture }, spaCreditSale: { count: m.spaSale }, spaEntitlement: { count: m.spaEntitlement }, spaStoredValueEntry: { count: m.spaValue } } }));
vi.mock("@/lib/line", () => ({ pushMessage: m.push, probeStoreLineRecipient: m.probe }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/usage-gate", () => ({ checkReminderSendLimit: () => ({ allowed: true }) }));
import { defaultTrialCareRules } from "@/lib/trial-care";
import { runTrialCare, handleTrialCarePostback, trialCareMessages } from "@/server/services/trial-care";
const now = new Date("2026-09-17T02:00:00Z");
const updatedAt = new Date("2026-09-15T00:00:00Z");
const token = "a".repeat(48);
const setting = { storeId: "A", enabled: true, activatedAt: updatedAt, updatedAt, rules: defaultTrialCareRules(), store: { id: "A", name: "店A", industryModule: "STEAMFOOT" } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("VERCEL_ENV", "production");
  m.settings.mockResolvedValue([setting]); m.setting.mockResolvedValue(setting); m.feature.mockResolvedValue(true);
  m.bookings.mockResolvedValue([{ id: "b", customerId: "c", trialCareCompletedAt: new Date("2026-09-16T03:00:00Z") }]);
  m.booking.mockResolvedValue({ id: "b" }); m.customer.mockResolvedValue({ name: "顧客", lineUserId: "line-c", convertedAt: null });
  m.findLog.mockResolvedValue(null); m.createLog.mockResolvedValue({ id: "log" }); m.updateLog.mockResolvedValue({}); m.countLog.mockResolvedValue(0);
  m.prefUpsert.mockResolvedValue({ id: "p", token, stoppedAt: null }); m.prefFind.mockResolvedValue({ stoppedAt: null });
  m.purchase.mockResolvedValue(0); m.wallets.mockResolvedValue(0); m.future.mockResolvedValue(0); m.messageCount.mockResolvedValue(0);
  m.config.mockResolvedValue({ lineOfficialUrl: "https://lin.ee/store-a" }); m.probe.mockResolvedValue({ status: "COMPATIBLE" }); m.push.mockResolvedValue({ success: true });
  m.tx.mockImplementation((items: Promise<unknown>[]) => Promise.all(items));
});
describe("trial care delivery", () => {
  it("blocks preview before any data access or delivery", async () => { vi.stubEnv("VERCEL_ENV", "preview"); expect((await runTrialCare(now)).blocked).toBe(true); expect(m.settings).not.toHaveBeenCalled(); expect(m.push).not.toHaveBeenCalled(); });
  it("sends through the candidate's own store with a fixed stop action", async () => {
    expect((await runTrialCare(now)).sent).toBe(1);
    expect(m.push).toHaveBeenCalledWith("A", "line-c", expect.any(Array), expect.any(String));
    expect(JSON.stringify(m.push.mock.calls[0][2])).toContain(`trial-care:stop:${token}`);
    expect(JSON.stringify(m.push.mock.calls[0][2])).not.toContain("了解方案／優惠");
    expect(m.bookings.mock.calls[0][0].where).toMatchObject({ storeId: "A", bookingType: "FIRST_TRIAL", bookingStatus: "COMPLETED", trialCareCompletedAt: { gte: updatedAt } });
  });
  it("never sends a claimed stage twice", async () => { m.findLog.mockResolvedValue({ id: "log", status: "SENDING" }); await runTrialCare(now); expect(m.push).not.toHaveBeenCalled(); });
  it("honors a stop made after the send was claimed", async () => { m.prefFind.mockResolvedValue({ stoppedAt: now }); await runTrialCare(now); expect(m.push).not.toHaveBeenCalled(); expect(m.updateLog).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "SKIPPED", reason: "顧客已停止接收" } })); });
  it("rechecks purchases immediately before an invitation", async () => {
    m.bookings.mockResolvedValue([{ id: "b", customerId: "c", trialCareCompletedAt: new Date("2026-09-13T03:00:00Z") }]);
    m.findLog.mockImplementation(({ where }) => where.storeId_customerId_stage.stage === 0 ? { id: "old" } : null);
    m.purchase.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await runTrialCare(now); expect(m.push).not.toHaveBeenCalled();
  });
  it("fails closed on an unverified LINE identity", async () => { m.probe.mockResolvedValue({ status: "INCOMPATIBLE" }); await runTrialCare(now); expect(m.push).not.toHaveBeenCalled(); });
  it("never falls back to another store or central account", async () => { m.customer.mockResolvedValue({ name: "顧客", lineUserId: null }); await runTrialCare(now); expect(m.push).not.toHaveBeenCalled(); });
  it("SPA requires an explicit trial and does not read Steamfoot bookings", async () => {
    const spa = { ...setting, store: { ...setting.store, industryModule: "SPA" } }; m.settings.mockResolvedValue([spa]); m.setting.mockResolvedValue(spa);
    m.spaBookings.mockResolvedValue([{ id: "s", customerId: "c", completedAt: new Date("2026-09-16T03:00:00Z") }]);
    m.spaBooking.mockResolvedValue({ id: "s" }); m.spaSale.mockResolvedValue(0); m.spaFuture.mockResolvedValue(0); m.spaEntitlement.mockResolvedValue(0); m.spaValue.mockResolvedValue(0);
    await runTrialCare(now); expect(m.bookings).not.toHaveBeenCalled(); expect(m.booking).not.toHaveBeenCalled(); expect(m.spaBookings.mock.calls[0][0].where).toMatchObject({ storeId: "A", isTrial: true, guestIndex: 1 });
  });
  it("unknown modules never guess their data source", async () => { m.settings.mockResolvedValue([{ ...setting, store: { ...setting.store, industryModule: "COURSE" } }]); await runTrialCare(now); expect(m.push).not.toHaveBeenCalled(); expect(m.bookings).not.toHaveBeenCalled(); });
  it("places an offer link only in invitations and only on LINE domains", () => {
    expect(JSON.stringify(trialCareMessages("hello", 1, token, "https://lin.ee/a"))).toContain("了解方案／優惠");
    expect(JSON.stringify(trialCareMessages("hello", 1, token, "https://evil.test"))).not.toContain("evil.test");
  });
});
describe("customer-controlled stop", () => {
  it("verifies both store and LINE sender before mutation", async () => {
    m.prefFirst.mockResolvedValue(null);
    await handleTrialCarePostback("B", "other-user", `trial-care:stop:${token}`, now.getTime());
    expect(m.prefFirst.mock.calls[0][0].where).toMatchObject({ storeId: "B", customer: { storeId: "B", lineUserId: "other-user" } });
    expect(m.prefUpdate).not.toHaveBeenCalled();
  });
  it("stops only trial care and ignores older replayed actions", async () => {
    m.prefFirst.mockResolvedValue({ id: "p" }); m.prefThrow.mockResolvedValue({ stoppedAt: now });
    const reply = await handleTrialCarePostback("A", "line-c", `trial-care:stop:${token}`, now.getTime());
    expect(m.prefUpdate.mock.calls[0][0].where.OR).toContainEqual({ lastEventAt: { lt: now } });
    expect(JSON.stringify(reply)).toContain("預約通知不受影響"); expect(m.setting).not.toHaveBeenCalled();
  });
});
