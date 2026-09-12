import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rows: [] as { id: string; name: string; parentStoreId: string | null; plan: string; maxStoresOverride: number | null }[], update: vi.fn(), audit: vi.fn(), lock: vi.fn(), admin: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findMany: async () => mocks.rows, findUnique: async ({ where }: { where: { id: string } }) => mocks.rows.find(s => s.id === where.id) ?? null },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $executeRaw: mocks.lock, store: { findMany: async () => mocks.rows, update: mocks.update }, auditLog: { create: mocks.audit } }),
} }));
vi.mock("@/lib/session", () => ({ requireAdminSession: mocks.admin }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/store-organization", () => ({ assertValidStoreParentAssignment: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { listStoreOrganizationAction, updateOrganizationCapacityAction, updateStoreParentAction } from "@/server/actions/store-organization";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.permission.mockResolvedValue({ id: "admin" });
  mocks.rows = [ { id: "hq", name: "HQ", parentStoreId: null, plan: "ALLIANCE", maxStoresOverride: null }, { id: "branch", name: "Branch", parentStoreId: null, plan: "BASIC", maxStoresOverride: null } ];
});
describe("organization subscription actions", () => {
  it("returns organization metadata only to admins", async () => {
    expect((await listStoreOrganizationAction()).success).toBe(true);
    expect(mocks.admin).toHaveBeenCalled();
  });
  it("updates organization only, retaining branch plan and audit history", async () => {
    expect((await updateStoreParentAction({ storeId: "branch", parentStoreId: "hq" })).success).toBe(true);
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "branch" }, data: { parentStoreId: "hq" } });
    expect(mocks.audit).toHaveBeenCalled();
  });
  it("rejects a second branch without purchased capacity", async () => {
    mocks.rows.push({ id: "existing", name: "Existing", parentStoreId: "hq", plan: "GROWTH", maxStoresOverride: null });
    expect((await updateStoreParentAction({ storeId: "branch", parentStoreId: "hq" })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects cycles inside the transaction", async () => {
    mocks.rows[1].parentStoreId = "hq";
    expect((await updateStoreParentAction({ storeId: "hq", parentStoreId: "branch" })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("records 31 purchased branch slots without changing a plan", async () => {
    expect((await updateOrganizationCapacityAction({ storeId: "hq", purchasedBranches: 31 })).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "hq" }, data: { maxStoresOverride: 32 } });
    expect(mocks.audit).toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483647])("rejects invalid capacity %s", async purchasedBranches => {
    expect((await updateOrganizationCapacityAction({ storeId: "hq", purchasedBranches })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("cannot reduce below existing usage or grant quota to a basic branch", async () => {
    mocks.rows.push(...["one", "two"].map(id => ({ id, name: id, parentStoreId: "hq", plan: "BASIC", maxStoresOverride: null })));
    expect((await updateOrganizationCapacityAction({ storeId: "hq", purchasedBranches: 1 })).success).toBe(false);
    expect((await updateOrganizationCapacityAction({ storeId: "branch", purchasedBranches: 31 })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("denies non-admin and permission failures before mutations", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await updateOrganizationCapacityAction({ storeId: "hq", purchasedBranches: 31 })).success).toBe(false);
    mocks.permission.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await updateStoreParentAction({ storeId: "branch", parentStoreId: "hq" })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
