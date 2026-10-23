import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  initialize: vi.fn(), ensure: vi.fn(), owners: vi.fn(), blocked: vi.fn(() => false), send: vi.fn(), quota: vi.fn(), token: vi.fn(() => "fixture"), central: vi.fn(() => null),
  setting: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  alert: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  logs: { count: vi.fn() }, balance: { count: vi.fn() }, managers: { count: vi.fn() },
}));
vi.mock("@/server/services/line-quota-settings", () => ({ initializeLineQuotaSettings: m.initialize, ensureLineQuotaSetting: m.ensure, LINE_QUOTA_STORE_FILTER: { operatingStatus: { in: ["ACTIVE", "TRIAL"] }, isDemo: false, archivedAt: null } }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://fixture.example.com" }));
vi.mock("@/lib/db", () => ({ prisma: { lineQuotaSetting: m.setting, lineQuotaAlert: m.alert, messageLog: m.logs, sessionBalanceNotification: m.balance, managerNotificationLog: m.managers } }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: m.blocked }));
vi.mock("@/lib/notification-email", () => ({ sendNotificationEmail: m.send }));
vi.mock("@/lib/line-config", () => ({ getLineAccessTokenForStore: m.token, getSteamButlerLineAccessToken: m.central }));
vi.mock("@/lib/line-quota", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/line-quota")>(), readLineQuota: m.quota }));
vi.mock("@/server/services/line-quota-recipients", async original => ({ ...await original<typeof import("@/server/services/line-quota-recipients")>(), getLineQuotaOwnerRecipients: m.owners }));
import { runLineQuotaMonitor, deliverQuotaAlert, notifyLineQuotaExhausted } from "@/server/services/line-quota-monitor";

const now = new Date("2026-10-22T10:00:00Z");
const setting = { storeId: "store-a", email: "owner@example.com", enabled: true, activatedAt: new Date("2026-10-01T00:00:00Z"), store: { name: "測試店" } };
beforeEach(() => {
  vi.clearAllMocks(); m.blocked.mockReturnValue(false);
  m.owners.mockResolvedValue({ emails: ["owner@example.com"], missingEmailCount: 0, ownerCount: 1 });
  m.ensure.mockResolvedValue(setting);
  m.setting.findMany.mockResolvedValue([setting]); m.setting.findUnique.mockResolvedValue(setting); m.setting.update.mockResolvedValue({});
  m.alert.findMany.mockResolvedValue([]); m.logs.count.mockResolvedValue(0); m.balance.count.mockResolvedValue(0); m.managers.count.mockResolvedValue(0);
  m.quota.mockResolvedValue({ used: 95, limit: 100 });
  m.alert.upsert.mockResolvedValue({ id: "alert-fixture", status: "SENT" });
  m.alert.updateMany.mockResolvedValue({ count: 1 });
  m.alert.findUniqueOrThrow.mockResolvedValue({ id: "alert-fixture", storeId: "store-a", email: setting.email, subject: "測試", body: "內容", createdAt: new Date(), status: "SENDING" });
  m.send.mockResolvedValue("provider-id");
});
it("records only the highest crossed monthly threshold", async () => {
  await runLineQuotaMonitor(now);
  expect(m.alert.upsert).toHaveBeenCalledTimes(1);
  expect(m.alert.upsert.mock.calls[0][0].where.storeId_eventKey).toEqual({ storeId: "store-a", eventKey: expect.stringMatching(/^STORE:2026-10:95:recipient:/) });
});
it("does not resend a sent event", async () => {
  await runLineQuotaMonitor(now); await runLineQuotaMonitor(now);
  expect(m.send).not.toHaveBeenCalled();
});
it("month keys reset at Taiwan midnight", async () => {
  await runLineQuotaMonitor(new Date("2026-10-31T16:00:00Z"));
  expect(m.alert.upsert.mock.calls[0][0].create.eventKey).toMatch(/^STORE:2026-11:95:recipient:/);
});
it("daily digest queries only this store and the previous complete Taiwan day", async () => {
  m.logs.count.mockResolvedValue(2);
  await runLineQuotaMonitor(now);
  const query = m.logs.count.mock.calls[0][0].where;
  expect(query.storeId).toBe("store-a"); expect(query.status).toBe("FAILED");
  expect(query.createdAt.gte.toISOString()).toBe("2026-10-20T16:00:00.000Z");
  expect(query.createdAt.lte.toISOString()).toBe("2026-10-21T15:59:59.999Z");
  expect(m.alert.upsert.mock.calls[1][0].create.eventKey).toMatch(/^failures:2026-10-21:recipient:/);
});
it("keeps a failed lookup visible without fabricating a zero quota", async () => {
  m.quota.mockRejectedValue(new Error("upstream unavailable"));
  expect(await runLineQuotaMonitor(now)).toEqual({ checked: 1, failed: 1 });
  expect(m.setting.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastError: expect.stringContaining("無法查詢"), snapshot: {} }) }));
  expect(m.alert.upsert).not.toHaveBeenCalled();
});
it("concurrent delivery losers never send", async () => {
  m.alert.updateMany.mockResolvedValue({ count: 0 });
  await deliverQuotaAlert("alert-fixture"); expect(m.send).not.toHaveBeenCalled();
});
it("disabled or changed recipients cancel queued alerts", async () => {
  m.owners.mockResolvedValue({ emails: ["new@example.com"], missingEmailCount: 0, ownerCount: 1 });
  await deliverQuotaAlert("alert-fixture");
  expect(m.send).not.toHaveBeenCalled();
  expect(m.alert.update).toHaveBeenCalledWith({ where: { id: "alert-fixture" }, data: { status: "CANCELLED" } });
});
it("delivery rejection remains FAILED and never SENT", async () => {
  m.send.mockRejectedValue(new Error("provider rejected"));
  await deliverQuotaAlert("alert-fixture");
  expect(m.alert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
});
it("preview skips reads, sends, and writes", async () => {
  m.blocked.mockReturnValue(true);
  expect(await runLineQuotaMonitor(now)).toEqual({ checked: 0, failed: 0, blocked: true });
  await notifyLineQuotaExhausted("store-a");
  expect(m.setting.findMany).not.toHaveBeenCalled(); expect(m.alert.upsert).not.toHaveBeenCalled();
});
it("immediate exhaustion and cron share one monthly deduplication key", async () => {
  await notifyLineQuotaExhausted("store-a");
  expect(m.alert.upsert.mock.calls[0][0].create.eventKey).toMatch(/^STORE:\d{4}-\d{2}:100:recipient:/);
});

it("creates separate stable monthly events for all current owners", async () => {
  m.owners.mockResolvedValue({ emails: ["first@example.com", "second@example.com"], missingEmailCount: 0, ownerCount: 2 });
  await runLineQuotaMonitor(now);
  expect(m.alert.upsert).toHaveBeenCalledTimes(2);
  expect(m.alert.upsert.mock.calls.map(([input]) => input.create.email)).toEqual(["first@example.com", "second@example.com"]);
  expect(new Set(m.alert.upsert.mock.calls.map(([input]) => input.create.eventKey)).size).toBe(2);
});
it("no owner email creates a visible warning and no delivery", async () => {
  m.owners.mockResolvedValue({ emails: [], missingEmailCount: 2, ownerCount: 2 });
  expect((await runLineQuotaMonitor(now)).failed).toBe(1);
  expect(m.alert.upsert).not.toHaveBeenCalled();
  expect(m.setting.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastError: expect.stringContaining("沒有可收信") }) }));
});
it("removed owners are cancelled before retry while remaining owners still send", async () => {
  m.owners.mockResolvedValue({ emails: ["remaining@example.com"], missingEmailCount: 0, ownerCount: 1 });
  m.alert.findUniqueOrThrow.mockResolvedValueOnce({ id: "removed", storeId: "store-a", email: "old@example.com", createdAt: new Date() })
    .mockResolvedValueOnce({ id: "remaining", storeId: "store-a", email: "remaining@example.com", subject: "test", body: "test", createdAt: new Date() });
  await deliverQuotaAlert("removed"); await deliverQuotaAlert("remaining");
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(m.send.mock.calls[0][0].to).toBe("remaining@example.com");
});
it("partial failure retries only the failed owner, never the already successful owner", async () => {
  m.owners.mockResolvedValue({ emails: ["first@example.com", "second@example.com"], missingEmailCount: 0, ownerCount: 2 });
  const records = new Map<string, Record<string, unknown>>();
  m.alert.upsert.mockImplementation(async ({ create }) => {
    if (!records.has(create.id)) records.set(create.id, { ...create, status: "PENDING", createdAt: new Date() });
    return records.get(create.id);
  });
  m.alert.findUniqueOrThrow.mockImplementation(async ({ where }) => records.get(where.id));
  m.alert.update.mockImplementation(async ({ where, data }) => Object.assign(records.get(where.id)!, data));
  m.send.mockResolvedValueOnce("first-accepted").mockRejectedValueOnce(new Error("second-failed")).mockResolvedValueOnce("second-accepted");
  await notifyLineQuotaExhausted("store-a");
  await notifyLineQuotaExhausted("store-a");
  expect(m.send.mock.calls.map(([input]) => input.to)).toEqual(["first@example.com", "second@example.com", "second@example.com"]);
  expect([...records.values()].map(record => record.status)).toEqual(["SENT", "SENT"]);
});
