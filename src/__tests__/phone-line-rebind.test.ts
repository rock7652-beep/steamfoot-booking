import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ transaction: vi.fn(), channel: vi.fn(), findIntents: vi.fn(), markIntent: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: h.transaction, lineRebindRequest: { findMany: h.findIntents, updateMany: h.markIntent } } }));
vi.mock("@/server/services/store-member-connection", () => ({ connectionChannel: h.channel }));
import { completePhoneLineRebind, startPhoneLineRebind } from "@/server/services/phone-line-rebind";
import { createHash } from "node:crypto";
const phone = "0912345678";
const line = `U${"a".repeat(32)}`;
const now = Date.now();
const input = { storeIds: ["store-a"], destination: "oa-a", lineUserId: line, phone, timestamp: now };
const makeTx = () => {
  const customer = { id: "customer-a", storeId: "store-a", phone, name: "A", userId: "user-a", lineUserId: null, lineLinkStatus: "UNLINKED", identityLinks: [] };
  const request = { id: "r", createdAt: new Date(now - 1000), expiresAt: new Date(now + 60_000), phoneHash: createHash("sha256").update(phone).digest("hex"), createdByUserId: "owner" };
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "r" }]),
    customer: { findMany: vi.fn().mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a" }]).mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(customer), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    lineRebindRequest: { findUnique: vi.fn().mockResolvedValue(request), update: vi.fn() },
    user: { findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => where.id === "owner" ? { id: "owner", role: "OWNER", status: "ACTIVE", staff: { storeId: "store-a", status: "ACTIVE" } } : { role: "CUSTOMER", status: "ACTIVE" }), create: vi.fn() },
    account: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    customerIdentityLink: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    storeMemberConnection: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
};
let tx: ReturnType<typeof makeTx>;
beforeEach(() => { tx = makeTx(); h.transaction.mockReset().mockImplementation(async (work) => work(tx)); h.channel.mockReturnValue({ identityProvider: "line-provider:123", channelKey: "oa-a" }); h.findIntents.mockReset().mockResolvedValue([{ id: "r" }]); h.markIntent.mockReset(); });
describe("phone rebind", () => {
  it("links the authorized customer and consumes the request without creating a Login account", async () => {
    expect(await completePhoneLineRebind(input)).toBe("linked");
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-a" }, data: expect.objectContaining({ lineUserId: line, lineLinkStatus: "LINKED" }) }));
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerId: "customer-a", storeId: "store-a", providerAccountId: line }) }));
    expect(tx.lineRebindRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONSUMED" }) }));
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
  it("rejects duplicate phone matches before changing data", async () => {
    tx.customer.findMany.mockReset().mockResolvedValue([{ id: "customer-a", storeId: "store-a" }, { id: "customer-b", storeId: "store-a" }]);
    expect(await completePhoneLineRebind(input)).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(h.markIntent).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "r", status: "PENDING_CAPTURE" }), data: { reason: "OA_PHONE_REBIND_FAILED" } }));
  });
  it("refuses another customer's LINE identity", async () => {
    tx.customer.findFirst.mockResolvedValue({ id: "customer-b" });
    expect(await completePhoneLineRebind(input)).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("refuses a different customer in another store sharing the LINE", async () => {
    tx.customer.findMany.mockReset().mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a" }]).mockResolvedValueOnce([{ id: "customer-b", userId: "user-b" }]);
    expect(await completePhoneLineRebind(input)).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("rejects events sent before the manager's authorization", async () => {
    expect(await completePhoneLineRebind({ ...input, timestamp: now - 2000 })).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("fails closed when the authorization has been cancelled", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    expect(await completePhoneLineRebind(input)).toBe("not_requested");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("accepts a redelivered event only when the same customer is already linked to that LINE", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    tx.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    expect(await completePhoneLineRebind(input)).toBe("linked");
    expect(tx.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", id: "customer-a", phone, lineUserId: line, lineLinkStatus: "LINKED" }) }));
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("refuses a manager who no longer has access to the store", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "owner", role: "OWNER", status: "ACTIVE", staff: { storeId: "store-b", status: "ACTIVE" } });
    expect(await completePhoneLineRebind(input)).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
});
describe("manager authorization", () => {
  it("creates a limited-time intent for the one unbound customer", async () => {
    const startTx = {
      customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-a", phone, lineUserId: null, lineLinkStatus: "UNLINKED" }), findMany: vi.fn().mockResolvedValue([{ id: "customer-a" }]) },
      lineRebindRequest: { updateMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "request" }) },
      storeMemberConnection: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    h.transaction.mockImplementation(async work => work(startTx));
    await startPhoneLineRebind({ customerId: "customer-a", storeId: "store-a", actorUserId: "owner" });
    expect(startTx.lineRebindRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerId: "customer-a", storeId: "store-a", createdByUserId: "owner", phoneHash: createHash("sha256").update(phone).digest("hex") }) }));
    expect(startTx.auditLog.create).toHaveBeenCalledOnce();
  });
});
