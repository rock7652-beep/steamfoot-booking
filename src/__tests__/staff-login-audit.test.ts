import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { staffLoginRecord: mocks } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone) Safari/1" }) }));
import { recordStaffLogin, touchStaffLogin } from "@/server/services/staff-login-audit";
import { loginAuditDevice } from "@/lib/login-audit-device";
describe("staff login evidence", () => {
  beforeEach(() => vi.clearAllMocks());
  it("records snapshots without tokens or raw request headers", async () => {
    await recordStaffLogin({ id: "u", name: "店長", role: "MANAGER", staff: { storeId: "s" } }, "SUCCESS", undefined, new Request("https://example.test", { headers: { "user-agent": "Windows Chrome/1", authorization: "secret", cookie: "secret" } }));
    expect(mocks.create).toHaveBeenCalledWith({ data: { actorUserId: "u", actorNameSnapshot: "店長", actorRoleSnapshot: "MANAGER", storeId: "s", outcome: "SUCCESS", reason: undefined, device: "Windows · Chrome" }, select: { id: true } });
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("secret");
  });
  it("does not invent a person or store for an unknown login", async () => {
    await recordStaffLogin(null, "FAILED", "驗證失敗");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: undefined, storeId: undefined, outcome: "FAILED" }) }));
  });
  it("throttles activity updates and scopes them to the same actor", async () => {
    await touchStaffLogin("login", "actor");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "login", actorUserId: "actor", outcome: "SUCCESS", OR: expect.arrayContaining([{ lastUsedAt: null }]) }) }));
  });
  it("returns a bounded coarse device label for arbitrary strings", () => {
    expect(loginAuditDevice("<script>secret</script>")).toBe("未知裝置 · 未知瀏覽器");
    expect(loginAuditDevice("iPhone CriOS/100 Safari/1")).toBe("iPhone · Chrome");
  });
});
