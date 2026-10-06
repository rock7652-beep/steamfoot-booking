import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), target: vi.fn(), actor: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), userUpdate: vi.fn(), upsert: vi.fn(), audit: vi.fn(), permissions: vi.fn(), feature: vi.fn(), tx: vi.fn(), raw: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireStaffSession: m.session }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: async () => "store-a" }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findUnique: m.target }, $transaction: (fn: (tx: unknown) => unknown) => m.tx(fn) } }));
vi.mock("@/lib/permissions", () => ({ ALL_PERMISSIONS: ["staff.manage", "inventory.read", "inventory.cost.read"], checkPermission: async () => true, getStaffPermissions: async () => new Set(), getDefaultPermissionsForRole: () => ["inventory.read"] }));
vi.mock("@/lib/revalidation", () => ({ revalidateStaff: vi.fn(), revalidateStaffPermissions: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature, getStoreLimitsByStoreId: async () => ({ maxStaff: 10 }) }));
vi.mock("@/server/services/operation-audit", () => ({ recordOperationAudit: m.audit }));
import { activateStaff, deactivateStaff, updateStaffPermissionsAction, updateStaff } from "@/server/actions/staff";
const target = (role = "STAFF", storeId = "store-a") => ({ id: "target", userId: "u-target", storeId, status: "ACTIVE", isOwner: false, user: { id: "u-target", role, status: "ACTIVE" } });
const actor = (role = "MANAGER") => ({ id: "u-actor", name: "Actor", staffId: "actor", role });
beforeEach(() => {
  vi.resetAllMocks(); m.session.mockResolvedValue(actor()); m.target.mockResolvedValue(target()); m.actor.mockResolvedValue({ role: "MANAGER", status: "ACTIVE" });
  m.findFirst.mockImplementation(async ({ where }) => where.id === "actor" ? { permissions: [{ permission: "staff.manage" }, { permission: "inventory.read" }] } : null);
  m.permissions.mockResolvedValue([]); m.count.mockResolvedValue(1);
  m.tx.mockImplementation(async fn => fn({ $queryRaw: m.raw, $executeRaw: m.raw,
    user: { findUnique: m.actor, update: m.userUpdate },
    staff: { findUniqueOrThrow: m.target, findFirst: m.findFirst, count: m.count, update: m.update },
    staffPermission: { findMany: m.permissions, upsert: m.upsert },
  }));
});
describe("three-role account management", () => {
  it.each(["OWNER", "MANAGER", "ADMIN"])("Manager cannot manage %s", async role => {
    m.target.mockResolvedValue(target(role)); expect((await deactivateStaff("target")).success).toBe(false); expect(m.update).not.toHaveBeenCalled();
  });
  it("Manager can deactivate Staff within its store", async () => {
    expect((await deactivateStaff("target")).success).toBe(true); expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "INACTIVE" } }));
  });
  it("rejects cross-store targets and self management", async () => {
    m.target.mockResolvedValue(target("STAFF", "store-b")); expect((await deactivateStaff("target")).success).toBe(false);
    m.target.mockResolvedValue({ ...target(), userId: "u-actor" }); expect((await updateStaffPermissionsAction("target", {} as never)).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("cannot grant cost access beyond the Manager's authority", async () => {
    expect((await updateStaffPermissionsAction("target", { "inventory.cost.read": true } as never)).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("preserves existing out-of-scope grants and audits partial changes accurately", async () => {
    m.permissions.mockResolvedValue([{ permission: "inventory.cost.read" }]);
    expect((await updateStaffPermissionsAction("target", { "inventory.read": true } as never)).success).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ after: { permissions: ["inventory.cost.read", "inventory.read"] } }), expect.anything());
  });
  it("rechecks revoked Manager grants inside the transaction", async () => {
    m.findFirst.mockResolvedValue({ permissions: [] }); expect((await updateStaffPermissionsAction("target", { "inventory.read": true } as never)).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("cannot promote Staff to Owner", async () => {
    expect((await updateStaff("target", { role: "OWNER" })).success).toBe(false); expect(m.userUpdate).not.toHaveBeenCalled();
  });
  it("Owner permissions cannot be toggled individually", async () => {
    m.session.mockResolvedValue(actor("OWNER")); m.actor.mockResolvedValue({ role: "OWNER", status: "ACTIVE" }); m.target.mockResolvedValue(target("OWNER"));
    expect((await updateStaffPermissionsAction("target", { "inventory.cost.read": false } as never)).success).toBe(false); expect(m.upsert).not.toHaveBeenCalled();
  });
  it("Admin also cannot deactivate the store's last Owner", async () => {
    m.session.mockResolvedValue(actor("ADMIN")); m.actor.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" }); m.target.mockResolvedValue(target("OWNER")); m.findFirst.mockResolvedValue({ id: "target" }); m.count.mockResolvedValue(0);
    expect((await deactivateStaff("target")).success).toBe(false); expect(m.update).not.toHaveBeenCalled(); expect(m.raw).toHaveBeenCalled();
  });
  it("activation retains capacity protection", async () => {
    m.target.mockResolvedValue({ ...target(), status: "INACTIVE" }); m.count.mockResolvedValue(10);
    expect((await activateStaff("target")).success).toBe(false); expect(m.update).not.toHaveBeenCalled();
  });
});

it("saves Staff promotion and chosen permissions in the same transaction", async () => {
  m.session.mockResolvedValue(actor("OWNER")); m.actor.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
  expect((await updateStaff("target", { role: "MANAGER", displayName: "升任店長", permissions: { "inventory.read": true, "inventory.cost.read": true } })).success).toBe(true);
  expect(m.tx).toHaveBeenCalledTimes(1);
  expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "u-target" }, data: { role: "MANAGER" } });
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { granted: true } }));
});
it("rejects an unauthorized combined grant before changing basic data", async () => {
  expect((await updateStaff("target", { displayName: "不可先儲存", permissions: { "inventory.cost.read": true } })).success).toBe(false);
  expect(m.update).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
});
it("combined editor cannot reduce the last Owner or override Owner permissions", async () => {
  m.session.mockResolvedValue(actor("ADMIN")); m.actor.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
  m.target.mockResolvedValue(target("OWNER")); m.findFirst.mockResolvedValue({ id: "target" }); m.count.mockResolvedValue(0);
  expect((await updateStaff("target", { role: "MANAGER" })).success).toBe(false);
  expect((await updateStaff("target", { permissions: { "inventory.read": false } })).success).toBe(false);
  expect(m.update).not.toHaveBeenCalled(); expect(m.userUpdate).not.toHaveBeenCalled();
});

it("combined editor status changes revoke backend login and enforce activation capacity", async () => {
  expect((await updateStaff("target", { status: "INACTIVE", displayName: "門市" })).success).toBe(true);
  expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "u-target" }, data: { status: "SUSPENDED" } });
  m.target.mockResolvedValue({ ...target(), status: "INACTIVE" }); m.count.mockResolvedValue(10); m.update.mockClear();
  expect((await updateStaff("target", { status: "ACTIVE" })).success).toBe(false);
  expect(m.update).not.toHaveBeenCalled();
});
