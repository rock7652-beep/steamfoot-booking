import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ link: vi.fn(), account: vi.fn(), create: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { resolveWebLineLinkedMember } from "@/server/services/web-line-linked-member";
const input = { storeId: "test-store", subject: "verified-subject", expectedUserId: "central", expectedCustomerId: "customer" };
const row = () => ({
  userId: "central", customerId: "customer",
  user: { status: "ACTIVE", role: "CUSTOMER" },
  customer: { userId: null, storeId: "test-store", mergedIntoCustomerId: null },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(fn => fn({ customerIdentityLink: { findUnique: mocks.link }, account: { findUnique: mocks.account, create: mocks.create } }));
  mocks.link.mockResolvedValue(row());
  mocks.account.mockResolvedValue({ userId: "central" });
});
describe("web LINE explicit central membership", () => {
  it("reuses an identity-link-only member without changing customer ownership", async () => {
    expect(await resolveWebLineLinkedMember(input)).toBe("central");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("creates only the missing OAuth Account for the verified central owner", async () => {
    mocks.account.mockResolvedValue(null);
    expect(await resolveWebLineLinkedMember(input)).toBe("central");
    expect(mocks.create).toHaveBeenCalledWith({ data: { provider: "line", providerAccountId: "verified-subject", userId: "central", type: "oauth" } });
  });
  it.each(["missing", "owner", "customer", "store", "merged", "legacy-owner", "inactive", "staff"])("rejects %s membership with zero writes", async reason => {
    const link = row();
    if (reason === "owner") link.userId = "other";
    if (reason === "customer") link.customerId = "other";
    if (reason === "store") link.customer.storeId = "other";
    if (reason === "merged") Object.assign(link.customer, { mergedIntoCustomerId: "other" });
    if (reason === "legacy-owner") Object.assign(link.customer, { userId: "other" });
    if (reason === "inactive") link.user.status = "INACTIVE";
    if (reason === "staff") link.user.role = "ADMIN";
    mocks.link.mockResolvedValue(reason === "missing" ? null : link);
    expect(await resolveWebLineLinkedMember(input)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects an Account belonging to another User", async () => {
    mocks.account.mockResolvedValue({ userId: "other" });
    expect(await resolveWebLineLinkedMember(input)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
