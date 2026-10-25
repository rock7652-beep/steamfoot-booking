vi.mock("@/server/services/plan-activation-enqueue",()=>({enqueuePlanActivation:vi.fn()}));
vi.mock("@/server/services/plan-activation-notification-kick",()=>({kickPlanActivationNotifications:vi.fn()}));
import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: {} }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: vi.fn(),
  getActiveStoreForRead: vi.fn(),
}));
vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: vi.fn(),
}));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: vi.fn() }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: vi.fn() }));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: vi.fn(),
}));
import { command, type BeautyActor } from "@/server/beauty/access";
import { assertCard, transition, assertCustomerAvailable } from "@/server/beauty/booking";
import { refund, collect, voidFee, issueCard } from "@/server/beauty/commerce";
import type { Tx } from "@/server/beauty/booking";
let tx: Tx;
const a: BeautyActor = { storeId: "s", userId: "operator", manager: true };
const member: BeautyActor = {
  storeId: "s",
  userId: "member-user",
  customerId: "member",
};
const r = { mode: "PERCENT", value: 50, base: "PAID" };
const b = {
  id: "b",
  personName:"合成顧客",serviceName:"合成服務",
  serviceId: "svc",
  storeId: "s",
  revision: 0,
  group: { customerId: "member" },
  customerId: "member",
  status: "RESERVED",
  technicianId: "t",
  startsAt: new Date("2099-10-20T02:00Z"),
  endsAt: new Date("2099-10-20T03:00Z"),
  occupiedEndsAt: new Date("2099-10-20T03:00Z"),
  cardId: "card",
  debit: false,
  fee: 0,
  rate: r,
  price: 1000,
  cancelDeduct: true,
  noShowDeduct: false,
};
const card = {
  id: "card",
  storeId: "s",
  closedAt: null,
  expiresAt: new Date("2100-01-01"),
  memberIds: ["member", "family"],
  serviceIds: ["svc"],
  remaining: 2,
  sessions: 10,
  listPrice: 10000,
  paid: 8000,
};
beforeEach(() => {
  tx = {
    beautyTransactionRevision:{findMany:vi.fn().mockResolvedValue([])},
    beautyCommand: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    beautyTechnician:{findMany:vi.fn().mockResolvedValue([{id:"t",name:"合成技師"}])},
    beautyEvent: { create: vi.fn(), upsert: vi.fn(), findMany:vi.fn().mockResolvedValue([]) },
    beautyAppointment: {
      findFirst: vi.fn().mockResolvedValue({ ...b }),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    beautySetting: { findUnique: vi.fn().mockResolvedValue(null) },
    beautyCard: {
      findFirst: vi.fn().mockResolvedValue({ ...card }),
      update: vi.fn(),
      findFirstOrThrow: vi.fn().mockResolvedValue({ ...card }),
    },
    beautyLedger: { create: vi.fn() },
    beautyPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      create: vi.fn().mockResolvedValue({ id: "p", amount: 500, note: "合成" }),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  } as unknown as Tx;
});
describe("beauty customer occupancy", () => {
  it("rejects another overlapping reservation before any mutation", async () => {
    vi.mocked(tx.beautyAppointment.count).mockResolvedValue(1);
    await expect(assertCustomerAvailable(tx, "s", "member", b.startsAt, b.occupiedEndsAt, "b"))
      .rejects.toThrow("服務者已有重疊預約");
    expect(tx.beautyAppointment.count).toHaveBeenCalledWith({where:{storeId:"s",customerId:"member",id:{not:"b"},status:{not:"CANCELLED"},startsAt:{lt:b.occupiedEndsAt},occupiedEndsAt:{gt:b.startsAt}}});
    expect(tx.beautyAppointment.update).not.toHaveBeenCalled();
  });
  it("accepts a free or adjacent interval using strict range boundaries", async () => {
    await expect(assertCustomerAvailable(tx, "s", "member", b.startsAt, b.occupiedEndsAt, "b"))
      .resolves.toBeUndefined();
  });
  it("does not invent a customer identity for an unlinked guest", async () => {
    await assertCustomerAvailable(tx, "s", null, b.startsAt, b.occupiedEndsAt);
    expect(tx.beautyAppointment.count).not.toHaveBeenCalled();
  });
  it("also rejects restoring a cancelled card booking before balance or ledger writes", async () => {
    vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,status:"CANCELLED"} as never);
    vi.mocked(tx.beautyAppointment.count).mockResolvedValue(1);
    await expect(transition(tx,a,{id:"b",revision:0,target:"RESERVED",reason:"恢復"}))
      .rejects.toThrow("服務者已有重疊預約");
    expect(tx.beautyCard.update).not.toHaveBeenCalled();
    expect(tx.beautyLedger.create).not.toHaveBeenCalled();
    expect(tx.beautyAppointment.update).not.toHaveBeenCalled();
  });
});
describe("beauty idempotent command", () => {
  it("a lost response retry returns the committed receipt without running mutation", async () => {
    vi.mocked(tx.beautyCommand.findUnique).mockResolvedValue({
      actorKey: "operator",
      intent: JSON.stringify({ id: "b" }),
      result: { id: "done" },
    } as never);
    const write = vi.fn();
    expect(await command(tx, a, "key", { id: "b" }, write)).toEqual({
      id: "done",
    });
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects another actor and changed payload", async () => {
    vi.mocked(tx.beautyCommand.findUnique).mockResolvedValue({
      actorKey: "other",
      intent: "{}",
      result: {},
    } as never);
    await expect(command(tx, a, "key", {}, vi.fn())).rejects.toThrow("已使用");
  });
});
describe("shared rights", () => {
  it("both caller and recipient must be named card members", async () => {
    await expect(
      assertCard(
        tx,
        { ...member, customerId: "intruder" },
        "card",
        "family",
        "svc",
        b.startsAt,
      ),
    ).rejects.toThrow("無權");
    await expect(
      assertCard(tx, member, "card", "stranger", "svc", b.startsAt),
    ).rejects.toThrow("未授權");
  });
  it("counts all outstanding reservations against the last shared balance", async () => {
    vi.mocked(tx.beautyAppointment.count).mockResolvedValue(2);
    await expect(
      assertCard(tx, member, "card", "family", "svc", b.startsAt),
    ).rejects.toThrow("不足");
  });
  it("rejects expired cards and inapplicable services", async () => {
    await expect(
      assertCard(tx, member, "card", "member", "wrong", b.startsAt),
    ).rejects.toThrow();
    vi.mocked(tx.beautyCard.findFirst).mockResolvedValue({
      ...card,
      expiresAt: new Date("2000-01-01"),
    } as never);
    await expect(
      assertCard(tx, member, "card", "member", "svc", b.startsAt),
    ).rejects.toThrow();
  });
});
describe("attendance and quota corrections", () => {
  it("completed service debits once and allocates paid-basis compensation", async () => {
    await transition(tx, a, {
      id: "b",
      revision: 0,
      target: "COMPLETED",
      reason: "完成",
    });
    expect(tx.beautyCard.update).toHaveBeenCalledWith({
      where: { id: "card" },
      data: { remaining: { increment: -1 } },
    });
    expect(tx.beautyAppointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ debit: true, fee: 400 }),
      }),
    );
  });
  it("deducting cancellation is not a performed service and earns no fee", async () => {
    await transition(tx, a, {
      id: "b",
      revision: 0,
      target: "CANCELLED",
      reason: "取消",
    });
    expect(tx.beautyAppointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ debit: true, fee: 0 }),
      }),
    );
  });
  it("non-deducting no-show does not consume quota", async () => {
    await transition(tx, a, {
      id: "b",
      revision: 0,
      target: "NO_SHOW",
      reason: "未到",
    });
    expect(tx.beautyCard.update).not.toHaveBeenCalled();
    expect(tx.beautyAppointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ debit: false, fee: 0 }),
      }),
    );
  });
  it("stale revision cannot consume a second unit", async () => {
    await expect(
      transition(tx, a, {
        id: "b",
        revision: 3,
        target: "COMPLETED",
        reason: "錯誤",
      }),
    ).rejects.toThrow("已更新");
    expect(tx.beautyCard.update).not.toHaveBeenCalled();
  });
  it("member cannot mark service completed or read another group", async () => {
    await expect(
      transition(tx, member, {
        id: "b",
        revision: 0,
        target: "COMPLETED",
        reason: "冒充",
      }),
    ).rejects.toThrow();
    vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({
      ...b,
      customerId: "other",
      group: { customerId: "other" },
    } as never);
    await expect(
      transition(tx, member, {
        id: "b",
        revision: 0,
        target: "CANCELLED",
        reason: "取消",
      }),
    ).rejects.toThrow("無權");
  });
  it("wrong technician cannot operate another person's service", async () => {
    await expect(
      transition(
        tx,
        { ...member, technicianId: "wrong" },
        { id: "b", revision: 0, target: "COMPLETED", reason: "冒充" },
      ),
    ).rejects.toThrow();
  });
});
describe("financial reversals", () => {
  it("refuses an over-refund and any refund while quota is reserved", async () => {
    vi.mocked(tx.beautyPayment.findFirst).mockResolvedValue({
      id: "original",
      kind: "SALE",
      amount: 1000,
      cardId: "card",
    } as never);
    vi.mocked(tx.beautyPayment.aggregate).mockResolvedValue({
      _sum: { amount: -500 },
    } as never);
    await expect(
      refund(tx, a, {
        requestKey: crypto.randomUUID(),
        paymentId: "original",
        amount: 501,
        method: "OTHER",
        reason: "協商",
      }),
    ).rejects.toThrow("超過");
    vi.mocked(tx.beautyPayment.aggregate).mockResolvedValue({
      _sum: { amount: 0 },
    } as never);
    vi.mocked(tx.beautyAppointment.count).mockResolvedValue(1);
    await expect(
      refund(tx, a, {
        requestKey: crypto.randomUUID(),
        paymentId: "original",
        amount: 500,
        method: "OTHER",
        reason: "協商",
      }),
    ).rejects.toThrow("占用");
    expect(tx.beautyPayment.create).not.toHaveBeenCalled();
  });
  it("refuses stale original-UI refund snapshots without touching the ledger or money",async()=>{
    vi.mocked(tx.beautyPayment.findFirst).mockResolvedValue({id:'original',kind:'SALE',amount:1000,cardId:'card'} as never);
    const input={requestKey:crypto.randomUUID(),paymentId:'original',amount:500,method:'OTHER' as const,reason:'核對'};
    await expect(refund(tx,a,input,{remaining:1,refundedAmount:0})).rejects.toThrow('方案額度已更新');
    vi.mocked(tx.beautyPayment.aggregate).mockResolvedValue({_sum:{amount:-100}} as never);
    await expect(refund(tx,a,input,{remaining:2,refundedAmount:0})).rejects.toThrow('退款紀錄已更新');
    expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyPayment.create).not.toHaveBeenCalled();
  });
  it("refuses collecting a package-backed appointment or overcharging", async () => {
    await expect(
      collect(tx, a, {
        requestKey: crypto.randomUUID(),
        ids: ["b"],
        amounts: [500],
        method: "OTHER",
        note: "",
      }),
    ).rejects.toThrow("不適用");
    vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({
      ...b,
      cardId: null,
    } as never);
    await expect(
      collect(tx, a, {
        requestKey: crypto.randomUUID(),
        ids: ["b"],
        amounts: [1001],
        method: "OTHER",
        note: "",
      }),
    ).rejects.toThrow("超過");
    expect(tx.beautyPayment.create).not.toHaveBeenCalled();
  });
});

it("late single-service collection updates paid-basis compensation without counting a second service", async () => {
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({
    ...b,
    cardId: null,
    status: "COMPLETED",
  } as never);
  await collect(tx, a, {
    requestKey: crypto.randomUUID(),
    ids: ["b"],
    amounts: [500],
    method: "OTHER",
    note: "尾款",
  });
  expect(tx.beautyAppointment.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ fee: 250 }) }),
  );
});
it("fee reversal appends a negative record and refuses more than the unreversed original", async () => {
  vi.mocked(tx.beautyPayment.findFirst).mockResolvedValue({
    id: "fee",
    kind: "FEE",
    amount: 500,
    appointmentId: "b",
    technicianId: "t",
  } as never);
  vi.mocked(tx.beautyPayment.aggregate).mockResolvedValue({
    _sum: { amount: -100 },
  } as never);
  await expect(
    voidFee(tx, a, {
      paymentId: "fee",
      amount: 401,
      method: "OTHER",
      reason: "退回",
    }),
  ).rejects.toThrow("超過");
  await voidFee(tx, a, {
    paymentId: "fee",
    amount: 400,
    method: "OTHER",
    reason: "已收回",
  });
  expect(tx.beautyPayment.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        kind: "FEE_VOID",
        amount: -400,
        originalPaymentId: "fee",
        technicianId: "t",
      }),
    }),
  );
});

it('permits an unidentified companion only through an enrolled sponsor and the shared switch',async()=>{
 vi.mocked(tx.beautyCard.findFirst).mockResolvedValue({...card,allowShared:true} as never);
 await expect(assertCard(tx,member,'card',null,'svc',b.startsAt,undefined,'member')).resolves.toBeDefined();
 await expect(assertCard(tx,{...member,customerId:'intruder'},'card',null,'svc',b.startsAt,undefined,'member')).rejects.toThrow('無權');
 await expect(assertCard(tx,member,'card',null,'svc',b.startsAt,undefined,'foreign')).rejects.toThrow('未授權');
 vi.mocked(tx.beautyCard.findFirst).mockResolvedValue({...card,allowShared:false} as never);
 await expect(assertCard(tx,member,'card',null,'svc',b.startsAt,undefined,'member')).rejects.toThrow('未授權');
});

it('does not require recording technician payment recovery for a service correction',async()=>{
 vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,status:'COMPLETED',debit:true,fee:400} as never);
 vi.mocked(tx.beautyPayment.aggregate).mockResolvedValue({_sum:{amount:400}} as never);
 await transition(tx,a,{id:'b',revision:0,target:'NO_SHOW',reason:'店家更正'});
 expect(tx.beautyAppointment.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'NO_SHOW',fee:0,debit:false})}));
 expect(tx.beautyPayment.create).not.toHaveBeenCalled();
});


describe("Beauty trial care enrollment boundaries",()=>{
 it("adds a stable first-completion marker for an identified trial without changing debit rules",async()=>{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,isTrial:true} as never);
  await transition(tx,a,{id:'b',revision:0,target:'COMPLETED',reason:''});
  expect(tx.beautyEvent.upsert).toHaveBeenCalledWith({where:{id:'beauty-trial-completed:b'},create:expect.objectContaining({id:'beauty-trial-completed:b',storeId:'s',appointmentId:'b',customerId:'member',kind:'TRIAL_CARE_COMPLETED',status:'AUDIT'}),update:{}});
  expect(tx.beautyLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({delta:-1})}));
 });
 it("does not enroll a regular single service or infer an anonymous guest from payer",async()=>{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,isTrial:true,customerId:null,cardId:null} as never);
  await transition(tx,a,{id:'b',revision:0,target:'COMPLETED',reason:''});
  expect(tx.beautyEvent.upsert).not.toHaveBeenCalled();
 });
});

describe('Beauty shared analytics sale attribution',()=>{
 it.each(['manager-at-sale',null])('captures the purchaser attribution %s from the authorized store, never the cashier, companion or supplied value',async(manager)=>{
  vi.mocked(tx.$queryRaw).mockResolvedValue([{id:'member',assignedStaffId:manager},{id:'family',assignedStaffId:'family-manager'}]);
  tx.beautyCard.create=vi.fn().mockResolvedValue({id:'issued'});
  const plan={id:'plan',storeId:'s',name:'方案',sessions:5,price:1000,validDays:90,serviceIds:['svc'],allowShared:true,customerPurchasable:true,active:true,revision:0,lowBalanceEnabled:false,lowBalanceThreshold:null};
  await issueCard(tx,a,{requestKey:'11111111-1111-4111-8111-111111111111',planId:'plan',customerId:'member',memberIds:['family'],paid:1000,method:'BANK_TRANSFER',revenueStaffId:'forged'} as Parameters<typeof issueCard>[2],plan);
  const event=vi.mocked(tx.beautyEvent.create).mock.calls[0][0].data;
  expect(event.kind).toBe('ISSUE_CARD');expect(JSON.parse(String(event.body))).toMatchObject({cardId:'issued',revenueStaffId:manager});
  const [sql,...values]=vi.mocked(tx.$queryRaw).mock.calls[0];
  expect('sql' in sql?sql.sql:Array.from(sql).join('')).toContain('s."storeId"=c."storeId"');expect(values).toContain('s');
 });
});

it.each(['PAID','LIST'] as const)('records discount separately and preserves %s compensation basis',async base=>{
 vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null,status:'COMPLETED',rate:{mode:'PERCENT',value:50,base}} as never);
 vi.mocked(tx.beautyPayment.create).mockResolvedValue({id:'new',amount:900} as never);
 await collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[900],method:'OTHER',note:'',quotes:[{id:'b',revision:0,price:1000,collected:0,discount:{kind:'PERCENT',value:10}}]},{canDiscount:true});
 expect(tx.beautyAppointment.update).toHaveBeenCalledWith({where:{id:'b'},data:{fee:base==='PAID'?450:500,revision:{increment:1}}});
 expect(tx.beautyEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:'SERVICE_DISCOUNT',appointmentId:'b',status:'AUDIT',body:expect.stringContaining('"netPrice":900')})}));
 expect(tx.beautyCard.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();
});
it('enforces discounted remaining balance on later payments even without another discount payload',async()=>{
 vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null} as never);
 vi.mocked(tx.beautyEvent.findMany).mockResolvedValue([{appointmentId:'b',body:JSON.stringify({kind:'AMOUNT',value:200,price:1000})}] as never);
 vi.mocked(tx.beautyPayment.findMany).mockResolvedValue([{id:'earlier',amount:600}] as never);
 await expect(collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[201],method:'OTHER',note:''})).rejects.toThrow('超過');expect(tx.beautyPayment.create).not.toHaveBeenCalled();
 vi.mocked(tx.beautyPayment.create).mockResolvedValue({id:'later',amount:200} as never);
 await collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[200],method:'OTHER',note:''});expect(tx.beautyAppointment.update).toHaveBeenCalledWith({where:{id:'b'},data:{revision:{increment:1}}});
});
it('rejects discount without grant, stale money snapshots and discounts below collected money before writes',async()=>{
 vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null} as never);
 const input={requestKey:crypto.randomUUID(),ids:['b'],amounts:[100],method:'OTHER' as const,note:'',quotes:[{id:'b',revision:0,price:1000,collected:0,discount:{kind:'AMOUNT' as const,value:100}}]};
 await expect(collect(tx,a,input)).rejects.toThrow('權限');await expect(collect(tx,a,{...input,quotes:[{...input.quotes[0],revision:9}]},{canDiscount:true})).rejects.toThrow('已更新');
 vi.mocked(tx.beautyPayment.findMany).mockResolvedValue([{id:'earlier',amount:950}] as never);await expect(collect(tx,a,{...input,quotes:[{...input.quotes[0],collected:950}]},{canDiscount:true})).rejects.toThrow('超過');expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(tx.beautyEvent.create).not.toHaveBeenCalled();
});

describe('explicit back-office attendance correction',()=>{
 it.each([
  ['RESERVED',false,'NO_SHOW',true,-1],['NO_SHOW',true,'NO_SHOW',false,1],['NO_SHOW',false,'NO_SHOW',true,-1],['NO_SHOW',true,'COMPLETED',undefined,0],['COMPLETED',true,'NO_SHOW',false,1],['NO_SHOW',true,'NO_SHOW',true,0]
 ] as const)('reconciles %s/%s to %s/%s exactly once',async(status,debit,target,noShowDeduct,delta)=>{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,status,debit,noShowDeduct:false} as never);
  await transition(tx,a,{id:'b',revision:0,target,reason:'合成出席更正',...(noShowDeduct===undefined?{}:{noShowDeduct})});
  if(delta)expect(tx.beautyLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({cardId:'card',delta})}));else expect(tx.beautyLedger.create).not.toHaveBeenCalled();
  expect(tx.beautyPayment.create).not.toHaveBeenCalled();
 });
 it('preserves an explicit no-show decision when a legacy caller repeats the same state',async()=>{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,status:'NO_SHOW',debit:true,noShowDeduct:false} as never);await transition(tx,a,{id:'b',revision:0,target:'NO_SHOW',reason:'重送'});expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyAppointment.update).not.toHaveBeenCalled();
 });
 it('rejects stale revisions and deduction without a plan before ledger writes',async()=>{
  await expect(transition(tx,a,{id:'b',revision:99,target:'NO_SHOW',noShowDeduct:true,reason:'合成'})).rejects.toThrow('預約已更新');vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null} as never);await expect(transition(tx,a,{id:'b',revision:0,target:'NO_SHOW',noShowDeduct:true,reason:'合成'})).rejects.toThrow('未使用方案');expect(tx.beautyLedger.create).not.toHaveBeenCalled();
 });
});
it('does not append another receipt or revision for a zero payment with unchanged discount',async()=>{
 vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null,status:'COMPLETED'} as never);
 vi.mocked(tx.beautyPayment.findMany).mockResolvedValue([{id:'paid',amount:1000}] as never);
 await collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[0],method:'OTHER',note:'',quotes:[{id:'b',revision:0,price:1000,collected:1000,discount:{kind:'AMOUNT',value:0}}]},{canDiscount:true});
 expect(tx.beautyPayment.create).not.toHaveBeenCalled();expect(tx.beautyAppointment.update).not.toHaveBeenCalled();expect(tx.beautyLedger.create).not.toHaveBeenCalled();
});
