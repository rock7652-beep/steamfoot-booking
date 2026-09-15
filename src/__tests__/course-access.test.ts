import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  link: vi.fn(),
  session: vi.fn(),
  account: vi.fn(),
  customer: vi.fn(),
  store: vi.fn(),
  module: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: m.account },
    customer: { findFirst: m.customer },
    staffMemberLink: { findUnique: m.link },
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: vi.fn() }));
vi.mock("@/lib/industry-module-server", () => ({
  requireCourseStore: m.module,
}));
vi.mock("@/server/services/member-request-store", () => ({
  resolveMemberRequestStoreId: m.store,
}));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: m.resolve,
}));
import { courseMember, courseAccount } from "@/server/services/course-access";
beforeEach(() => {
  vi.clearAllMocks();
  m.link.mockResolvedValue(null);
  m.session.mockResolvedValue({ id: "a", storeId: "store-a" });
  m.account.mockResolvedValue({ id: "a" });
  m.store.mockResolvedValue("store-a");
  m.resolve.mockResolvedValue({ customerId: "learner-a" });
  m.customer.mockResolvedValue({ id: "learner-a", name: "A" });
});
describe("course fixed member access", () => {
  it("uses the resolved fixed account and store, never contact matching", async () => {
    expect((await courseMember()).customer.id).toBe("learner-a");
    expect(m.customer).toHaveBeenCalledWith({
      where: {
        id: "learner-a",
        storeId: "store-a",
        mergedIntoCustomerId: null,
      },
      select: { id: true, name: true },
    });
  });
  it("does not bypass central unlink or conflict rejection with legacy fallback", async () => {
    m.resolve.mockResolvedValue(null);
    await expect(courseMember()).rejects.toThrow("帳號尚未連結");
    expect(m.customer).not.toHaveBeenCalled();
  });
  it("allows fixed coach identity but rejects member operations for coach-only mode", async () => {
    m.link.mockResolvedValue({ courseMemberEnabled: false });
    expect((await courseAccount()).user.id).toBe("a");
    await expect(courseMember()).rejects.toThrow("僅開放教練工作");
  });
  it("rejects suspended accounts before resolving membership", async () => {
    m.account.mockResolvedValue(null);
    await expect(courseMember()).rejects.toThrow("帳號已停用");
    expect(m.resolve).not.toHaveBeenCalled();
  });
});
