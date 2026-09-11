import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), storeFilter: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: h.findFirst } } }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(), requireStaffSession: vi.fn() }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: h.storeFilter }));
import { getCustomerEditForUser } from "@/server/queries/customer";

type User = Parameters<typeof getCustomerEditForUser>[0];
const staff: User = { id: "staff-user", name: "Test", email: null, role: "OWNER", staffId: "staff-a", customerId: null, storeId: "store-a", storeSlug: "test" };

beforeEach(() => {
  vi.clearAllMocks();
  h.storeFilter.mockReturnValue({ storeId: "store-a" });
  h.findFirst.mockResolvedValue({ id: "customer-a", notes: "保留備註", mergedIntoCustomerId: null, user: null });
});

describe("customer edit query", () => {
  it("keeps store filtering and notes without fetching history", async () => {
    const result = await getCustomerEditForUser(staff, "customer-a");
    expect(result.notes).toBe("保留備註");
    const query = h.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: "customer-a", storeId: "store-a" });
    expect(query.include).toBeUndefined();
    for (const key of ["planWallets", "bookings", "transactions", "followUps"]) {
      expect(query.select).not.toHaveProperty(key);
    }
  });
  it.each([
    [null, "顧客不存在"],
    [{ mergedIntoCustomerId: "other" }, "此顧客已合併進其他顧客"],
    [{ user: { status: "SUSPENDED" } }, "此顧客的登入帳號已停用"],
  ])("rejects inaccessible records %#", async (record, message) => {
    h.findFirst.mockResolvedValue(record);
    await expect(getCustomerEditForUser(staff, "customer-a")).rejects.toThrow(message);
  });
  it("rejects another customer's identity before querying", async () => {
    await expect(getCustomerEditForUser({ ...staff, role: "CUSTOMER", customerId: "other" }, "customer-a"))
      .rejects.toThrow("只能查看自己的資料");
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});
