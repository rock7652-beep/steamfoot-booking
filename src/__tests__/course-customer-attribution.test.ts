import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ manager: vi.fn(), customer: vi.fn(), staff: vi.fn(), update: vi.fn(), search: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager }));
vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ customer: { findFirst: m.customer, update: m.update }, staff: { findFirst: m.staff } }),
  customer: { findMany: m.search },
} }));
import { saveCourseCustomerAttribution, searchCourseReferrerCandidates } from "@/server/actions/course-customer-attribution";
import { AppError } from "@/lib/errors";
const input = { customerId: "customer", assignedStaffId: "manager", referredByCustomerId: "sponsor" };
beforeEach(() => {
  vi.clearAllMocks();
  m.manager.mockResolvedValue({ storeId: "store" });
  m.customer.mockResolvedValue({ id: "customer" });
  m.staff.mockResolvedValue({ id: "manager" });
  m.update.mockResolvedValue({});
  m.search.mockResolvedValue([]);
});
describe("course customer attribution", () => {
  it("requires assignment permission and validates all identities within the store", async () => {
    expect(await saveCourseCustomerAttribution(input)).toMatchObject({ success: true });
    expect(m.manager).toHaveBeenCalledWith("customer.assign");
    expect(m.customer).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "customer", storeId: "store", mergedIntoCustomerId: null } }));
    expect(m.customer).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: "sponsor", storeId: "store", mergedIntoCustomerId: null } }));
    expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "manager", storeId: "store", status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } } }));
    expect(m.update).toHaveBeenCalledWith({ where: { id: "customer", storeId: "store" }, data: { assignedStaffId: "manager", sponsorId: "sponsor" } });
  });
  it("rejects permission denial without reading or changing customer data", async () => {
    m.manager.mockRejectedValueOnce(new AppError("FORBIDDEN", "無權限"));
    expect(await saveCourseCustomerAttribution(input)).toMatchObject({ success: false });
    expect(m.customer).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects a foreign customer before assigning anything", async () => {
    m.customer.mockResolvedValueOnce(null);
    expect(await saveCourseCustomerAttribution(input)).toMatchObject({ success: false });
    expect(m.staff).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects an inactive, foreign, or coach-only assignee", async () => {
    m.staff.mockResolvedValueOnce(null);
    expect(await saveCourseCustomerAttribution(input)).toMatchObject({ success: false });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects a foreign sponsor without partially changing the assigned manager", async () => {
    m.customer.mockResolvedValueOnce({ id: "customer" }).mockResolvedValueOnce(null);
    expect(await saveCourseCustomerAttribution(input)).toMatchObject({ success: false });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects self referral and permits explicitly clearing a sponsor", async () => {
    expect(await saveCourseCustomerAttribution({ ...input, referredByCustomerId: "customer" })).toMatchObject({ success: false });
    expect(m.update).not.toHaveBeenCalled();
    expect(await saveCourseCustomerAttribution({ ...input, referredByCustomerId: null })).toMatchObject({ success: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedStaffId: "manager", sponsorId: null } }));
  });
  it("searches only unmerged customers in the current store and masks phones", async () => {
    m.search.mockResolvedValueOnce([{ id: "sponsor", name: "推薦人", phone: "0912345678" }]);
    expect(await searchCourseReferrerCandidates("推薦", "customer")).toEqual({ success: true, data: [{ id: "sponsor", name: "推薦人", phoneMasked: "0912•••678" }] });
    expect(m.manager).toHaveBeenCalledWith("customer.read");
    expect(m.search).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", mergedIntoCustomerId: null, id: { not: "customer" } }), take: 10 }));
  });
});
