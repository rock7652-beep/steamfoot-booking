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
  it('reuses an existing verified CENTRAL member for an unbound store row instead of creating a conflicting new owner',async()=>{
    h.channel.mockReturnValue({identityProvider:'line',channelKey:'oa-a'});
    const customer=await tx.customer.findUnique();
    tx.customer.findUnique.mockResolvedValue({...customer,userId:null,identityLinks:[]});
    tx.account.findUnique.mockImplementation(async({where})=>where.provider_providerAccountId.provider==='line'?{userId:'user-a',user:{role:'CUSTOMER',status:'ACTIVE'}}:null);
    tx.account.findMany.mockResolvedValue([{userId:'user-a'}]);
    tx.customer.findMany.mockReset().mockResolvedValueOnce([{id:'customer-a',storeId:'store-a'}]).mockResolvedValueOnce([{id:'other-store-row',userId:null,identityLinks:[{userId:'user-a'}]}]);
    tx.customerIdentityLink.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{customerId:'other-store-row',userId:'user-a'}]);
    expect(await completePhoneLineRebind(input)).toBe('linked');
    expect(tx.user.create).not.toHaveBeenCalled();expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'user-a',customerId:'customer-a',storeId:'store-a',provider:'line-messaging:oa-a'})}));
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'customer-a'},data:expect.objectContaining({lineUserId:line,lineLinkStatus:'LINKED'})}));
  });
  it.each([{role:'OWNER',status:'ACTIVE'},{role:'CUSTOMER',status:'SUSPENDED'}])('refuses a CENTRAL account which is not an active customer: %j',async user=>{
    h.channel.mockReturnValue({identityProvider:'line',channelKey:'oa-a'});
    tx.account.findUnique.mockImplementation(async({where})=>where.provider_providerAccountId.provider==='line'?{userId:'user-a',user}:null);
    expect(await completePhoneLineRebind(input)).toBe('conflict');expect(tx.customer.update).not.toHaveBeenCalled();expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('does not replace an already-known owner with a different central account',async()=>{
    h.channel.mockReturnValue({identityProvider:'line',channelKey:'oa-a'});
    tx.account.findUnique.mockImplementation(async({where})=>where.provider_providerAccountId.provider==='line'?{userId:'different-owner',user:{role:'CUSTOMER',status:'ACTIVE'}}:null);
    expect(await completePhoneLineRebind(input)).toBe('conflict');expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it('still supports a genuinely new messaging member without manufacturing an OAuth account',async()=>{
    h.channel.mockReturnValue({identityProvider:'line',channelKey:'oa-a'});
    const customer=await tx.customer.findUnique();tx.customer.findUnique.mockResolvedValue({...customer,userId:null,identityLinks:[]});
    tx.user.create.mockResolvedValue({id:'new-member'});
    expect(await completePhoneLineRebind(input)).toBe('linked');
    expect(tx.user.create).toHaveBeenCalledWith({data:{name:'A',role:'CUSTOMER',status:'ACTIVE'},select:{id:true}});
    expect(tx.customerIdentityLink.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'new-member',provider:'line-messaging:oa-a'})}));
    expect(tx.account.create).not.toHaveBeenCalled();
  });
  it('accepts an active ADMIN authorization without requiring a store Staff row',async()=>{
    tx.user.findUnique.mockImplementation(({where})=>where.id==='owner'?{id:'owner',role:'ADMIN',status:'ACTIVE',staff:null}:{role:'CUSTOMER',status:'ACTIVE'});
    expect(await completePhoneLineRebind(input)).toBe('linked');expect(tx.customer.update).toHaveBeenCalledOnce();
  });
  it('never borrows central OAuth membership for an unconfigured legacy messaging channel',async()=>{
    h.channel.mockReturnValue({identityProvider:'line-messaging:oa-a',channelKey:'oa-a'});
    const customer=await tx.customer.findUnique();tx.customer.findUnique.mockResolvedValue({...customer,userId:null,identityLinks:[]});
    tx.user.create.mockResolvedValue({id:'new-user'});tx.account.findMany.mockResolvedValue([{userId:'user-a'}]);
    expect(await completePhoneLineRebind(input)).toBe('conflict');
    expect(tx.account.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.account.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{provider_providerAccountId:{provider:'line-messaging:oa-a',providerAccountId:line}}}));
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it('allows a fresh LINE message to retry a failed intent with the same original authorization and expiry',async()=>{
    const request=await tx.lineRebindRequest.findUnique();tx.lineRebindRequest.findUnique.mockResolvedValue({...request,reason:'OA_PHONE_REBIND_FAILED'});
    expect(await completePhoneLineRebind(input)).toBe('linked');
    const [sql,...values]=tx.$queryRaw.mock.calls[0];expect(sql.join('?')).toContain('"status"=\'PENDING_CAPTURE\'');
    expect(values).toContain('OA_PHONE_REBIND_V1');expect(values).toContain('OA_PHONE_REBIND_FAILED');
    expect(tx.lineRebindRequest.update).toHaveBeenCalledWith({where:{id:'r'},data:{status:'CONSUMED',consumedAt:expect.any(Date)}});
  });
  it('does not revive an expired failed intent',async()=>{
    const request=await tx.lineRebindRequest.findUnique();tx.lineRebindRequest.findUnique.mockResolvedValue({...request,reason:'OA_PHONE_REBIND_FAILED',expiresAt:new Date(now-1000)});
    expect(await completePhoneLineRebind(input)).toBe('conflict');expect(tx.customer.update).not.toHaveBeenCalled();
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
    tx.customer.findMany.mockReset().mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a" }]).mockResolvedValueOnce([{ id: "customer-b", userId: "user-b", identityLinks: [] }]);
    expect(await completePhoneLineRebind(input)).toBe("conflict");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("accepts another store's customer only when verified identity links establish the same owner", async () => {
    tx.customer.findMany.mockReset().mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a" }]).mockResolvedValueOnce([{ id: "customer-b", userId: null, identityLinks: [{ userId: "user-a" }] }]);
    expect(await completePhoneLineRebind(input)).toBe("linked");
    expect(tx.customer.update).toHaveBeenCalledOnce();
  });
  it.each([
    { id: "other", userId: null, identityLinks: [] },
    { id: "other", userId: null, identityLinks: [{ userId: "user-a" }, { userId: "user-b" }] },
  ])("rejects another store's customer with missing or conflicting ownership", async other => {
    tx.customer.findMany.mockReset().mockResolvedValueOnce([{ id: "customer-a", storeId: "store-a" }]).mockResolvedValueOnce([other]);
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
  it('keeps an active failed phone authorization retryable without creating a new request or extending its expiry',async()=>{
    const startTx={customer:{findFirst:vi.fn().mockResolvedValue({id:'customer-a',phone,lineUserId:null,lineLinkStatus:'UNLINKED'}),findMany:vi.fn().mockResolvedValue([{id:'customer-a'}])},lineRebindRequest:{updateMany:vi.fn(),findFirst:vi.fn().mockResolvedValue({id:'existing',reason:'OA_PHONE_REBIND_FAILED'}),create:vi.fn()},storeMemberConnection:{updateMany:vi.fn()},auditLog:{create:vi.fn()}};
    h.transaction.mockImplementation(async work=>work(startTx));
    await expect(startPhoneLineRebind({customerId:'customer-a',storeId:'store-a',actorUserId:'owner'})).resolves.toBeUndefined();
    expect(startTx.lineRebindRequest.create).not.toHaveBeenCalled();expect(startTx.storeMemberConnection.updateMany).not.toHaveBeenCalled();
  });
});
