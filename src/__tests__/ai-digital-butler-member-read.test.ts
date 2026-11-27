import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), canonical: vi.fn(), module: vi.fn(), entitlement: vi.fn(), read: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/customer-identity", () => ({ getCanonicalCustomerForSession: m.canonical }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.module }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.entitlement }));
vi.mock("@/server/queries/liff-my-bookings", () => ({ listConfirmedMyBookings: m.read }));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs", () => ({ assertAiPreview: m.preview }));
import { aiMemberViewKey } from "@/server/ai/member-context";
import { GET } from "@/app/api/ai/member-bookings/route";
const member = { userId: "ai-preview-member-user-a", customerId: "member-a", storeId: "ai-preview-steamfoot", userVersion: "version-1" };
const request = (extra: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams({ date: "2026-11-27", page: "1", viewKey: aiMemberViewKey(member) });
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) params.set(key, value);
  return new Request("https://synthetic.invalid/api/ai/member-bookings?" + params);
};
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("AI_IDENTITY_SECRET", "s".repeat(40)); m.preview.mockReturnValue(undefined);
  m.session.mockResolvedValue({ id: member.userId, role: "CUSTOMER", storeId: member.storeId }); m.module.mockResolvedValue("steamfoot"); m.entitlement.mockResolvedValue(undefined);
  m.canonical.mockResolvedValue({ id: member.customerId, storeId: member.storeId, verifiedUserVersion: member.userVersion });
  m.read.mockResolvedValue({ identity: member, date: "2026-11-27", page: 1, pageSize: 25, total: 1,
    bookings: [{ date: "2026-11-27", time: "10:00", status: "CONFIRMED", people: 1 }], privateNote: "PRIVATE_NOTE", email: "PRIVATE_EMAIL" }); });
it("confirmed customer GET returns only minimal data, no identity or contact fields, with private no-store headers", async () => {
  const response = await GET(request()), data = await response.json(); expect(response.status).toBe(200); expect(data.success).toBe(true);
  expect(data.snapshot.bookings).toEqual([{ date: "2026-11-27", time: "10:00", status: "CONFIRMED", people: 1 }]);
  expect(JSON.stringify(data)).not.toMatch(/PRIVATE|userId|customerId|storeId|email|privateNote/);
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
});
it.each([{ customerId: "foreign" }, { storeId: "foreign" }, { page: "1001" }, { date: "2026-02-30" }])("rejects injected identity and invalid arguments before reading", async extra => {
  expect((await GET(request(extra))).status).toBe(400); expect(m.session).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
});
it.each([{ id: "owner", role: "OWNER", storeId: member.storeId }, { id: "ai-preview-member-user-c", role: "CUSTOMER", storeId: "ai-preview-beauty" }])("does not let a staff session or another store impersonate a member", async user => {
  m.session.mockResolvedValue(user); expect((await GET(request())).status).toBe(403); expect(m.read).not.toHaveBeenCalled();
});
it("a workspace proof from A cannot be reused by B", async () => {
  m.session.mockResolvedValue({ id: "ai-preview-member-user-b", role: "CUSTOMER", storeId: member.storeId });
  m.canonical.mockResolvedValue({ id: "member-b", storeId: member.storeId, verifiedUserVersion: "version-1" }); expect((await GET(request())).status).toBe(403); expect(m.read).not.toHaveBeenCalled();
});
it("unconfirmed membership, revoked entitlement and wrong module fail closed", async () => {
  m.canonical.mockResolvedValueOnce(null); expect((await GET(request())).status).toBe(403);
  m.entitlement.mockRejectedValueOnce(Object.assign(new Error("DENIED"), { code: "FORBIDDEN" })); expect((await GET(request())).status).toBe(403);
  m.module.mockResolvedValueOnce("beauty"); expect((await GET(request())).status).toBe(403); expect(m.read).not.toHaveBeenCalled();
});
it("relationship changes during the read withhold all returned data", async () => {
  m.read.mockImplementation(async () => { m.canonical.mockResolvedValue(null); return { identity: member, date: "2026-11-27", page: 1, pageSize: 25, total: 0, bookings: [] }; });
  const response = await GET(request()); expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty("snapshot");
});
it("a business read resolved for another identity is withheld", async () => {
  m.read.mockResolvedValueOnce({ identity: { ...member, customerId: "other" } }); expect((await GET(request())).status).toBe(403);
});
it("database errors are retryable failures, not empty booking histories", async () => {
  m.read.mockRejectedValueOnce(new Error("PRIVATE_DB_CREDENTIAL")); const response = await GET(request()), data = await response.json(); expect(response.status).toBe(503); expect(data.success).toBe(false); expect(JSON.stringify(data)).not.toMatch(/PRIVATE_DB/);
});
it("non-Preview requests are rejected before any identity read", async () => {
  m.preview.mockImplementationOnce(() => { throw Error("NOT_PREVIEW"); }); expect((await GET(request())).status).toBe(404); expect(m.session).not.toHaveBeenCalled();
});
