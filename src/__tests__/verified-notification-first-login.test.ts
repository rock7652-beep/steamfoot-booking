import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  store: { findUnique: vi.fn() },
  customer: { findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  account: { findUnique: vi.fn(), create: vi.fn() },
  customerIdentityLink: { findFirst: vi.fn(), create: vi.fn() },
  centralMemberLinkReviewRequest: { findFirst: vi.fn() },
  lineRebindRequest: { findFirst: vi.fn() }, auditLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { $transaction: transaction } }));
import { activateVerifiedNotificationMember } from "@/server/services/verified-notification-first-login";
const input = { storeId: "store-a", lineUserId: "U-verified" };
const customer = { id: "original-customer", name: "顧客原名", phone: "0912345678", userId: null, identityLinks: [] };
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async callback => callback(tx));
  tx.store.findUnique.mockResolvedValue({ industryModule: "STEAMFOOT" });
  tx.customer.findMany.mockResolvedValue([customer]);
  tx.customer.updateMany.mockResolvedValue({ count: 1 });
  tx.user.findUnique.mockResolvedValue(null);
  tx.account.findUnique.mockResolvedValue(null);
  tx.customerIdentityLink.findFirst.mockResolvedValue(null);
  tx.centralMemberLinkReviewRequest.findFirst.mockResolvedValue(null);
  tx.lineRebindRequest.findFirst.mockResolvedValue(null);
  tx.user.create.mockResolvedValue({ id: "new-user" });
});
describe("first member login using the verified notification identity", () => {
  it("atomically activates the original trial record using no browser name or phone", async () => {
    expect(await activateVerifiedNotificationMember(input)).toBe("activated");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      storeId: input.storeId, lineUserId: input.lineUserId, lineLinkStatus: "LINKED", mergedIntoCustomerId: null,
    }, take: 2 }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: {
      id: customer.id, storeId: input.storeId, phone: customer.phone, userId: null,
      lineUserId: input.lineUserId, lineLinkStatus: "LINKED", mergedIntoCustomerId: null, identityLinks: { none: {} },
    }, data: { userId: "new-user", authSource: "LINE" } });
    expect(tx.account.create).toHaveBeenCalledWith({ data: { userId: "new-user", provider: "line", providerAccountId: input.lineUserId, type: "oauth" } });
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: { userId: "new-user", storeId: input.storeId,
      customerId: customer.id, provider: "line", providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      targetId: customer.id, action: "FIRST_LOGIN_VERIFIED_NOTIFICATION_IDENTITY",
    }) }));
  });
  it("does not match by phone when LINE subjects differ or no recipient is linked", async () => {
    tx.customer.findMany.mockResolvedValue([]);
    expect(await activateVerifiedNotificationMember(input)).toBe("not_applicable");
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it.each([null, "COURSE", "BEAUTY", "SPA"])("does not change another module: %s", async industryModule => {
    tx.store.findUnique.mockResolvedValue(industryModule ? { industryModule } : null);
    expect(await activateVerifiedNotificationMember(input)).toBe("not_applicable");
    expect(tx.customer.findMany).not.toHaveBeenCalled();
  });
  it.each([
    [customer, { ...customer, id: "duplicate" }], [{ ...customer, userId: "owner" }],
    [{ ...customer, identityLinks: [{ id: "link" }] }], [{ ...customer, phone: "bad" }],
    [{ ...customer, phone: "0912-345-678" }],
  ].map(rows => ({ rows })))("retains review for ambiguous, owned or malformed records: $rows", async ({ rows }) => {
    tx.customer.findMany.mockResolvedValue(rows);
    expect(await activateVerifiedNotificationMember(input)).toBe("review");
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it.each(["phone", "account", "link", "unlink", "grant"])("keeps an existing %s conflict for review", async kind => {
    const lookup = { phone: tx.user.findUnique, account: tx.account.findUnique,
      link: tx.customerIdentityLink.findFirst, unlink: tx.centralMemberLinkReviewRequest.findFirst,
      grant: tx.lineRebindRequest.findFirst }[kind]!;
    lookup.mockResolvedValue({ id: "conflict" });
    expect(await activateVerifiedNotificationMember(input)).toBe("review");
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it("rejects a concurrent owner or notification change before saving credentials", async () => {
    tx.customer.updateMany.mockResolvedValue({ count: 0 });
    expect(await activateVerifiedNotificationMember(input)).toBe("review");
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.customerIdentityLink.create).not.toHaveBeenCalled();
  });
  it.each(["P2002", "P2034"])("does not report success after a transactional conflict: %s", async code => {
    transaction.mockRejectedValue({ code });
    expect(await activateVerifiedNotificationMember(input)).toBe("review");
  });
  it.each(["account", "link", "audit"])("fails closed if the %s write fails", async kind => {
    const write = { account: tx.account.create, link: tx.customerIdentityLink.create, audit: tx.auditLog.create }[kind]!;
    write.mockRejectedValue(new Error("unavailable"));
    expect(await activateVerifiedNotificationMember(input)).toBe("unavailable");
  });
});
