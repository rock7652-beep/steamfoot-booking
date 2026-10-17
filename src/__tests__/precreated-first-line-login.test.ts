import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  customer: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  account: { findUnique: vi.fn(), create: vi.fn() },
  customerIdentityLink: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { $transaction: transaction } }));
import { activateUnlinkedStoreMember } from "@/server/services/precreated-first-line-login";
const input = { storeId: "store-a", lineUserId: "U-verified", name: "呂育芬", phone: "0972153183" };
const customer = { id: "customer-a", name: "呂育芬", userId: null, lineUserId: null, mergedIntoCustomerId: null, identityLinks: [] };
describe("precreated member first LINE login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    tx.customer.findMany.mockResolvedValue([customer]);
    tx.customer.findFirst.mockResolvedValue(null);
    tx.user.findUnique.mockResolvedValue(null);
    tx.account.findUnique.mockResolvedValue(null);
    tx.customerIdentityLink.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: "user-a" });
    tx.customer.updateMany.mockResolvedValue({ count: 1 });
  });
  it("activates the existing record and atomically persists login identity", async () => {
    expect(await activateUnlinkedStoreMember(input)).toBe("activated");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-a", phone: input.phone }, take: 2 }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: customer.id, name: customer.name, phone: input.phone, userId: null, lineUserId: null, identityLinks: { none: {} } }) }));
    expect(tx.account.create).toHaveBeenCalledWith({ data: { userId: "user-a", provider: "line", providerAccountId: input.lineUserId, type: "oauth" } });
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: { userId: "user-a", storeId: "store-a", customerId: customer.id, provider: "line", providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
  it.each([
    [], [customer, { ...customer, id: "duplicate" }],
    [{ ...customer, name: "另一人" }], [{ ...customer, userId: "owner" }],
    [{ ...customer, lineUserId: "other-line" }],
    [{ ...customer, mergedIntoCustomerId: "merged" }],
    [{ ...customer, identityLinks: [{ id: "existing-link" }] }],
  ].map(rows => ({ rows })))("rejects unmatched, ambiguous or owned customer rows: $rows", async ({ rows }) => {
    tx.customer.findMany.mockResolvedValue(rows);
    expect(await activateUnlinkedStoreMember(input)).toBe("review");
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });
  it.each(["phone", "account", "lineCustomer", "lineLink"])("does not adopt an existing %s owner", async kind => {
    const lookup = kind === "phone" ? tx.user.findUnique : kind === "account" ? tx.account.findUnique : kind === "lineCustomer" ? tx.customer.findFirst : tx.customerIdentityLink.findFirst;
    lookup.mockResolvedValue({ id: "other-owner" });
    expect(await activateUnlinkedStoreMember(input)).toBe("review");
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it("normalizes phone and trims the entered name before matching", async () => {
    expect(await activateUnlinkedStoreMember({ ...input, name: " 呂育芬 ", phone: "0972-153-183" })).toBe("activated");
  });
  it("activates a notification-only trial customer when its recipient is the verified Login subject", async () => {
    tx.customer.findMany.mockResolvedValue([{ ...customer, lineUserId: input.lineUserId }]);
    expect(await activateUnlinkedStoreMember(input)).toBe("activated");
    expect(tx.customer.findFirst).toHaveBeenCalledWith({ where: {
      storeId: input.storeId, lineUserId: input.lineUserId, id: { not: customer.id },
    }, select: { id: true } });
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lineUserId: input.lineUserId, userId: null, identityLinks: { none: {} } }),
      data: expect.objectContaining({ lineUserId: input.lineUserId }),
    }));
  });
  it("does not claim a notification recipient that changed during activation", async () => {
    tx.customer.findMany.mockResolvedValue([{ ...customer, lineUserId: input.lineUserId }]);
    tx.customer.updateMany.mockResolvedValue({ count: 0 });
    expect(await activateUnlinkedStoreMember(input)).toBe("review");
    expect(tx.account.create).not.toHaveBeenCalled();
  });
  it("rejects invalid phones without opening a transaction", async () => {
    expect(await activateUnlinkedStoreMember({ ...input, phone: "invalid" })).toBe("review");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("rejects a concurrent claim before writing Account or identity link", async () => {
    tx.customer.updateMany.mockResolvedValue({ count: 0 });
    expect(await activateUnlinkedStoreMember(input)).toBe("review");
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.customerIdentityLink.create).not.toHaveBeenCalled();
  });
  it.each(["P2002", "P2034"])("reports transactional conflicts without success: %s", async code => {
    transaction.mockRejectedValue({ code });
    expect(await activateUnlinkedStoreMember(input)).toBe("review");
  });
  it("fails if the store identity link cannot persist", async () => {
    tx.customerIdentityLink.create.mockRejectedValue(new Error("database unavailable"));
    expect(await activateUnlinkedStoreMember(input)).toBe("unavailable");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
