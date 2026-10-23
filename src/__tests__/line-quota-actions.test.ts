import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  permission: vi.fn(), store: vi.fn(), feature: vi.fn(), refresh: vi.fn(), send: vi.fn(), ensure: vi.fn(),
  setting: { findUnique: vi.fn(), upsert: vi.fn() }, alert: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }, audit: { create: vi.fn() }, owners: vi.fn(),
}));
vi.mock("@/server/services/line-quota-settings", () => ({ ensureLineQuotaSetting: m.ensure }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store, getActiveStoreForRead: m.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/notification-email", () => ({ notificationEmailReadiness: () => ({ blocked: false, configured: true }), sendNotificationEmail: m.send }));
vi.mock("@/lib/db", () => {
  const tx = { lineQuotaSetting: m.setting, auditLog: m.audit };
  return { prisma: { ...tx,  lineQuotaAlert: m.alert, $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } };
});
vi.mock("@/server/services/line-quota-recipients", async original => ({ ...await original<typeof import("@/server/services/line-quota-recipients")>(), getLineQuotaOwnerRecipients: m.owners }));
import { getLineQuotaNotificationSetting, saveLineQuotaNotificationSetting, sendLineQuotaTestEmail } from "@/server/actions/line-quota-notifications";
beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue({ id: "owner-fixture" }); m.store.mockResolvedValue("active-store");
  m.setting.findUnique.mockResolvedValue({ storeId: "active-store", enabled: false });
  m.ensure.mockResolvedValue({ storeId: "active-store", enabled: true });
  m.alert.create.mockImplementation(async ({ data }) => data); m.send.mockResolvedValue("accepted");
  m.alert.findFirst.mockResolvedValue(null); m.owners.mockResolvedValue({ emails: ["boss@example.com"], missingEmailCount: 0, ownerCount: 1 });
});
it("writes only the server-selected active store and audits the change", async () => {
  expect((await saveLineQuotaNotificationSetting({ enabled: true })).success).toBe(true);
  expect(m.permission).toHaveBeenCalledWith("business_hours.manage");
  expect(m.setting.upsert.mock.calls[0][0].where).toEqual({ storeId: "active-store" });
  expect(m.audit.create.mock.calls[0][0].data.actorUserId).toBe("owner-fixture");
});
it("rejects injected store IDs and invalid emails", async () => {
  expect((await saveLineQuotaNotificationSetting({ enabled: true, storeId: "other-store" } as never)).success).toBe(false);
  expect((await saveLineQuotaNotificationSetting({ email: "invalid", enabled: true } as never)).success).toBe(false);
  expect(m.setting.upsert).not.toHaveBeenCalled();
});
it("permission denial cannot save or send", async () => {
  m.permission.mockRejectedValue(new Error("forbidden"));
  expect((await saveLineQuotaNotificationSetting({ enabled: true })).success).toBe(false);
  expect((await sendLineQuotaTestEmail()).success).toBe(false);
  expect(m.setting.upsert).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
});
it("test email uses saved recipient rather than client-supplied input", async () => {
  const result = await sendLineQuotaTestEmail(); expect(result.success).toBe(true);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "boss@example.com" }));
  expect(m.alert.create.mock.calls[0][0].data.storeId).toBe("active-store");
});
it("duplicate test claims never send again", async () => {
  m.alert.create.mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "P2002" }));
  expect((await sendLineQuotaTestEmail()).success).toBe(false); expect(m.send).not.toHaveBeenCalled();
});
it("shows all owner recipients with the site-wide default enabled", async () => {
  m.setting.findUnique.mockResolvedValue(null);
  m.owners.mockResolvedValue({ emails: ["one@example.com", "two@example.com"], missingEmailCount: 0, ownerCount: 2 });
  const result = await getLineQuotaNotificationSetting();
  expect(result).toMatchObject({ recipients: ["one@example.com", "two@example.com"], enabled: true, hasSavedSetting: false });
  expect(m.owners).toHaveBeenCalledWith("active-store");
  expect(m.setting.upsert).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
});
it("does not accept a manually injected recipient", async () => {
  expect((await saveLineQuotaNotificationSetting({ enabled: true, email: "other@example.com" } as never)).success).toBe(false);
  expect(m.setting.upsert).not.toHaveBeenCalled();
});
it("cannot enable without valid owner emails but can disable", async () => {
  m.owners.mockResolvedValue({ emails: [], missingEmailCount: 2, ownerCount: 2 });
  expect((await saveLineQuotaNotificationSetting({ enabled: true })).success).toBe(false);
  expect((await saveLineQuotaNotificationSetting({ enabled: false })).success).toBe(true);
});
it("sends separate test messages to all owners and records partial failure", async () => {
  m.owners.mockResolvedValue({ emails: ["one@example.com", "two@example.com"], missingEmailCount: 0, ownerCount: 2 });
  m.send.mockResolvedValueOnce("accepted").mockRejectedValueOnce(new Error("rejected"));
  const result = await sendLineQuotaTestEmail();
  expect(m.send.mock.calls.map(([input]) => input.to)).toEqual(["one@example.com", "two@example.com"]);
  expect(new Set(m.alert.create.mock.calls.map(([input]) => input.data.eventKey)).size).toBe(2);
  expect(result.success && "message" in result && result.message).toContain("1 封寄送失敗");
  expect(m.alert.update.mock.calls.map(([input]) => input.data.status)).toEqual(["SENT", "FAILED"]);
});
it("test recipients are rechecked when an owner changes during delivery", async () => {
  m.owners.mockResolvedValueOnce({ emails: ["one@example.com", "two@example.com"] })
    .mockResolvedValue({ emails: ["one@example.com"] });
  await sendLineQuotaTestEmail();
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(m.send.mock.calls[0][0].to).toBe("one@example.com");
});
