import { beforeEach, describe, expect, it, vi } from "vitest";

const source = {
  id: "source-user", name: "來源", role: "CUSTOMER", status: "ACTIVE", passwordHash: null,
  accounts: [{ id: "line-account", provider: "line", providerAccountId: "line-source" }],
  customerIdentityLinks: [{ id: "line-link", storeId: "store-a", customerId: "customer-a", provider: "line", providerAccountId: "line-source" }],
  customer: null,
};
const target = {
  id: "target-user", name: "主要", role: "CUSTOMER", status: "ACTIVE", passwordHash: "hash",
  accounts: [], customerIdentityLinks: [], customer: null,
};
const tx = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  account: { updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  customerIdentityLink: { updateMany: vi.fn(), count: vi.fn() },
  customer: { update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  centralMemberLinkReviewRequest: { updateMany: vi.fn() },
  session: { deleteMany: vi.fn(), count: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } }));

beforeEach(() => {
  vi.clearAllMocks();
  tx.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => where.id === source.id ? source : target);
  tx.customer.findMany.mockResolvedValue([{ id: "customer-a", storeId: "store-a", lineUserId: "line-source", lineLinkStatus: "LINKED", planWallets: [], bookings: [], transactions: [] }]);
  tx.account.count.mockImplementation(({ where }: { where: { userId: string } }) => where.userId === source.id ? 0 : 1);
  tx.customerIdentityLink.count.mockResolvedValue(0);
  tx.session.count.mockResolvedValue(0);
  tx.customer.count.mockResolvedValue(0);
});

describe("executeCentralUserMerge", () => {
  it("rechecks the plan, moves safe links, expires sessions and preserves a suspended source row", async () => {
    const { executeCentralUserMerge } = await import("@/server/services/central-user-merge");
    const result = await executeCentralUserMerge({ sourceUserId: source.id, targetUserId: target.id, actorUserId: "admin" });

    expect(result.executable).toBe(true);
    expect(result.verification).toEqual({
      operationalDataPreserved: true,
      sourceLoginDisabled: true,
      sourceSessionsCleared: true,
      targetLoginMethods: 2,
      checkedCustomerRecords: 1,
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["line-account"] } }, data: { userId: target.id } });
    expect(tx.customerIdentityLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["line-link"] } }, data: { userId: target.id } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: source.id } });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: { status: "SUSPENDED", email: null, phone: null, passwordHash: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: "admin", targetType: "User", targetId: target.id, action: "MERGE_CENTRAL_USER",
    }) });
  });

  it("performs zero writes when fresh data introduces a provider conflict", async () => {
    tx.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => where.id === source.id
      ? source
      : { ...target, accounts: [{ id: "other", provider: "line", providerAccountId: "different-line" }] });
    const { executeCentralUserMerge } = await import("@/server/services/central-user-merge");
    await expect(executeCentralUserMerge({ sourceUserId: source.id, targetUserId: target.id, actorUserId: "admin" }))
      .rejects.toThrow("中央會員整合已阻擋");
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rolls back before audit when operational records change during the merge", async () => {
    tx.customer.findMany
      .mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a", lineUserId: "line-source", lineLinkStatus: "LINKED", planWallets: [], bookings: [], transactions: [] }])
      .mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a", lineUserId: "line-source", lineLinkStatus: "LINKED", planWallets: [{ id: "wallet-a", totalSessions: 10, remainingSessions: 9, status: "ACTIVE" }], bookings: [], transactions: [] }]);
    const { executeCentralUserMerge } = await import("@/server/services/central-user-merge");
    await expect(executeCentralUserMerge({ sourceUserId: source.id, targetUserId: target.id, actorUserId: "admin" }))
      .rejects.toThrow("方案、堂數、預約、付款或 LINE 綁定發生變化");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
