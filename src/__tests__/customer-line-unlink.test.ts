import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ permission: vi.fn(), find: vi.fn(), access: vi.fn(), unlink: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findUnique: h.find } } }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: h.access }));
vi.mock("@/server/services/customer-line-unlink", () => ({ unlinkCustomerLine: h.unlink }));
import { unlinkLineAccount } from "@/server/actions/customer-line";

beforeEach(() => {
  vi.resetAllMocks();
  h.find.mockResolvedValue({ id: "customer-a", storeId: "store-a", mergedIntoCustomerId: null });
});
describe("LINE unlink authorization", () => {
  it.each(["OWNER", "ADMIN"])("allows %s with permission and store access", async role => {
    h.permission.mockResolvedValue({ id: "actor", role });
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: true });
    expect(h.permission).toHaveBeenCalledWith("customer.identity.rebind");
    expect(h.unlink).toHaveBeenCalledExactlyOnceWith({ customerId: "customer-a", storeId: "store-a", actorUserId: "actor" });
  });
  it.each(["MANAGER", "STAFF", "PARTNER", "CUSTOMER"])("rejects %s despite a stale permission grant", async role => {
    h.permission.mockResolvedValue({ id: "actor", role });
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: false });
    expect(h.unlink).not.toHaveBeenCalled();
  });
  it("rejects missing permission and read-only sessions before touching customer data", async () => {
    h.permission.mockRejectedValue(new Error("FORBIDDEN"));
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: false });
    expect(h.find).not.toHaveBeenCalled();
  });
  it("does not write across stores", async () => {
    h.permission.mockResolvedValue({ id: "actor", role: "OWNER", storeId: "store-b" });
    h.access.mockImplementation(() => { throw new Error("FORBIDDEN"); });
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: false });
    expect(h.unlink).not.toHaveBeenCalled();
  });
  it.each([null, { mergedIntoCustomerId: "another" }])("rejects missing or merged customers", async customer => {
    h.permission.mockResolvedValue({ id: "actor", role: "OWNER" });
    h.find.mockResolvedValue(customer);
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: false });
    expect(h.unlink).not.toHaveBeenCalled();
  });
  it("does not report success or invalidate data after a failed transaction", async () => {
    h.permission.mockResolvedValue({ id: "actor", role: "OWNER" });
    h.unlink.mockRejectedValue(new Error("transaction failed"));
    expect(await unlinkLineAccount("customer-a")).toMatchObject({ success: false });
    expect(h.revalidate).not.toHaveBeenCalled();
  });
});
