import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), permission: vi.fn(), find: vi.fn(), update: vi.fn(), audit: vi.fn(), many: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminSession: mocks.admin }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn() }));
vi.mock("@/lib/errors", () => ({ AppError: Error, handleActionError: (e: Error) => ({ success: false, error: e.message }) }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findMany: mocks.many },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ store: { findUnique: mocks.find, update: mocks.update }, auditLog: { create: mocks.audit } }),
} }));
import { setStoreArchivedAction } from "@/server/actions/store-archive";
import { getAccessibleStores, getStoreOptions } from "@/lib/store";
describe("HQ catalog archive", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "admin" }); mocks.permission.mockResolvedValue(undefined); mocks.find.mockResolvedValue({ archivedAt: null, isDefault: false }); });
  it("rejects non-admin before any database mutation", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    expect((await setStoreArchivedAction("qa", true)).success).toBe(false);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("requires backend staff.manage permission", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    expect((await setStoreArchivedAction("qa", true)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("archives only the timestamp and records an audit", async () => {
    expect((await setStoreArchivedAction("qa", true)).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "qa" }, data: { archivedAt: expect.any(Date) } });
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("ARCHIVE");
  });
  it("restores without modifying operational fields", async () => {
    mocks.find.mockResolvedValue({ archivedAt: new Date(), isDefault: false });
    expect((await setStoreArchivedAction("qa", false)).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "qa" }, data: { archivedAt: null } });
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("RESTORE");
  });
  it("protects default store and is idempotent", async () => {
    mocks.find.mockResolvedValue({ archivedAt: null, isDefault: true });
    expect((await setStoreArchivedAction("staging", true)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await setStoreArchivedAction("staging", false)).success).toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("hides archived selector entries without reducing authorization", async () => {
    const rows = [{ id: "qa", name: "QA" }, { id: "staging", name: "Staging" }];
    mocks.many.mockImplementation(({ where }) => Promise.resolve(where.archivedAt ? [{ id: "qa" }] : rows));
    expect(await getStoreOptions({ role: "ADMIN" })).toEqual([rows[1]]);
    expect(await getAccessibleStores({ role: "ADMIN" })).toEqual(rows);
  });
});
