import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(), store: { findUnique: vi.fn() }, trialBookingLink: { findFirst: vi.fn() },
  customer: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() }, account: { findUnique: vi.fn(), create: vi.fn() },
  customerIdentityLink: { findMany: vi.fn(), create: vi.fn() },
  centralMemberLinkReviewRequest: { findFirst: vi.fn() }, auditLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { $transaction: transaction } }));
import { resolvePublicTrialLoginCustomer } from "@/server/services/public-trial-login-customer";
const subject = "U" + "a".repeat(32);
const input = { name: "驗收新客", phone: "0900001432", entry: { linkId: "entry", storeId: "store",
  channel: "LINE" as const, chatIdentity: subject, notificationVerified: false,
  verifiedLogin: { channelId: "2010761154", lineUserId: subject } } };
const customer = { id: "original", name: input.name, assignedStaffId: null, lineUserId: null, lineLinkStatus: "UNLINKED" };
const account = { userId: "owner", user: { id: "owner", status: "ACTIVE", customer: null } };
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(fn => fn(tx));
  tx.store.findUnique.mockResolvedValue({ industryModule: "STEAMFOOT", slug: "zhubei" });
  tx.trialBookingLink.findFirst.mockResolvedValue({ id: "entry" });
  tx.account.findUnique.mockResolvedValue(null);
  tx.customerIdentityLink.findMany.mockResolvedValue([]);
  tx.user.findUnique.mockResolvedValue(null);
  tx.customer.findMany.mockResolvedValue([]);
  tx.user.create.mockResolvedValue({ id: "owner" });
  tx.customer.create.mockResolvedValue(customer);
  tx.customer.update.mockResolvedValue(customer);
  tx.centralMemberLinkReviewRequest.findFirst.mockResolvedValue(null);
});
describe("verified public-trial Login capture", () => {
  it("creates a Login identity while keeping an incompatible OA recipient unlinked", async () => {
    expect(await resolvePublicTrialLoginCustomer(input)).toMatchObject({ status: "resolved", customerCreated: true, ownerId: "owner" });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.customer.create).toHaveBeenCalledWith({ data: {
      storeId: "store", name: input.name, phone: input.phone, userId: "owner", authSource: "LINE", customerStage: "LEAD", selfBookingEnabled: false,
    }, select: expect.any(Object) });
    expect(tx.account.create).toHaveBeenCalledWith({ data: { userId: "owner", provider: "line", providerAccountId: subject, type: "oauth" } });
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: { userId: "owner", storeId: "store", customerId: "original", provider: "line", providerAccountId: subject, lineUserId: subject } });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
  it("stores a notification recipient only with independent reachability proof", async () => {
    expect((await resolvePublicTrialLoginCustomer({ ...input, entry: { ...input.entry, notificationVerified: true } })).status).toBe("resolved");
    expect(tx.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lineUserId: subject, lineLinkStatus: "LINKED" }) }));
  });
  it("reuses an existing verified global account for a genuinely new store customer", async () => {
    tx.account.findUnique.mockResolvedValue({ ...account, user: { ...account.user, customer: { id: "another-store" } } });
    tx.user.findUnique.mockResolvedValue({ id: "owner" });
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("resolved");
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.customer.create.mock.calls[0][0].data).not.toHaveProperty("userId");
  });
  it("returns the exact existing store member without creating duplicates", async () => {
    tx.account.findUnique.mockResolvedValue(account);
    tx.customerIdentityLink.findMany.mockResolvedValue([{ userId: "owner", storeId: "store", customerId: "original" }]);
    tx.customer.findFirst.mockResolvedValue(customer);
    expect(await resolvePublicTrialLoginCustomer(input)).toMatchObject({ status: "resolved", customerCreated: false });
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.customerIdentityLink.create).not.toHaveBeenCalled();
  });
  it.each([
    { id: "candidate", userId: null, lineUserId: "U-other", mergedIntoCustomerId: null, identityLinks: [] },
    { id: "candidate", userId: "other-owner", lineUserId: subject, mergedIntoCustomerId: null, identityLinks: [] },
    { id: "candidate", userId: null, lineUserId: null, mergedIntoCustomerId: null, identityLinks: [] },
  ])("does not adopt an existing phone row without actual ownership: %j", async candidate => {
    tx.customer.findMany.mockResolvedValue([candidate]);
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("does not trust a notification subject without the reachability check", async () => {
    tx.customer.findMany.mockResolvedValue([{ id: "candidate", userId: null, lineUserId: subject, mergedIntoCustomerId: null, identityLinks: [] }]);
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
  });
  it("rejects a phone already owned by a different global member", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "other" });
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
    expect(tx.customer.create).not.toHaveBeenCalled();
  });
  it("rejects identity links whose owner disagrees with the Account", async () => {
    tx.account.findUnique.mockResolvedValue(account);
    tx.customerIdentityLink.findMany.mockResolvedValue([{ userId: "other", storeId: "store", customerId: "original" }]);
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
  });
  it.each(["expired_entry", "other_module", "inactive_account"])("fails closed for %s", async problem => {
    if (problem === "expired_entry") tx.trialBookingLink.findFirst.mockResolvedValue(null);
    if (problem === "other_module") tx.store.findUnique.mockResolvedValue({ industryModule: "BEAUTY", slug: "zhubei" });
    if (problem === "inactive_account") tx.account.findUnique.mockResolvedValue({ ...account, user: { ...account.user, status: "INACTIVE" } });
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
    expect(tx.customer.create).not.toHaveBeenCalled();
  });
  it("rejects an entry verified for another Login channel", async () => {
    expect((await resolvePublicTrialLoginCustomer({ ...input, entry: { ...input.entry, verifiedLogin: { channelId: "wrong", lineUserId: subject } } })).status).toBe("conflict");
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(["P2002", "P2034"])("returns a conflict after a transactional race: %s", async code => {
    transaction.mockRejectedValue({ code });
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("conflict");
  });
  it("does not report success when the identity link fails to persist", async () => {
    tx.customerIdentityLink.create.mockRejectedValue(new Error("unavailable"));
    expect((await resolvePublicTrialLoginCustomer(input)).status).toBe("unavailable");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
