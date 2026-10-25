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

it.each([['first',300,0],['second',0,500]] as const)('freezes the correct fixed-fee delta for the %s service collection',async(_kind,storeAmount,previous)=>{
 vi.stubEnv('BEAUTY_CHARGE_RULES_ENABLED','1');vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','s');vi.stubEnv('BEAUTY_CHARGE_RULES_SCOPE','stores');
 try{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null} as never);
  tx.beautyEvent.findFirst=vi.fn().mockResolvedValue({body:JSON.stringify({storeCost:300})});
  vi.mocked(tx.beautyEvent.findMany).mockImplementation(({where}={})=>Promise.resolve(where?.kind==='SERVICE_DISCOUNT'?[]:[{body:JSON.stringify({paymentId:'earlier',revenueStaffId:'original-manager',allocation:{storeAmount:300,developerAmount:200,shortfall:0}})}]) as never);
  vi.mocked(tx.beautyPayment.findMany).mockResolvedValue(previous?[{id:'earlier',kind:'SALE',amount:500,createdAt:new Date('2026-10-01')} ] as never:[]);
  vi.mocked(tx.$queryRaw).mockResolvedValue([{assignedStaffId:'current-manager'}]);
  await collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[500],method:'OTHER',note:'合成核對'});
  const event=vi.mocked(tx.beautyEvent.create).mock.calls.find(([arg])=>arg.data.kind==='SERVICE_SALE_ATTRIBUTION')![0].data;
  expect(JSON.parse(String(event.body))).toMatchObject({paymentId:'p',revenueStaffId:'current-manager',allocation:{storeAmount,developerAmount:500-storeAmount,shortfall:0}});
 }finally{vi.unstubAllEnvs();}
});
it('uses refunded immutable shares when a cancelled service is restored and later collected again',async()=>{
 vi.stubEnv('BEAUTY_CHARGE_RULES_ENABLED','1');vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','s');vi.stubEnv('BEAUTY_CHARGE_RULES_SCOPE','stores');
 try{
  vi.mocked(tx.beautyAppointment.findFirst).mockResolvedValue({...b,cardId:null} as never);
  tx.beautyEvent.findFirst=vi.fn().mockResolvedValue({body:'{"storeCost":300}'});
  vi.mocked(tx.beautyEvent.findMany).mockImplementation(({where}={})=>Promise.resolve(where?.kind==='SERVICE_DISCOUNT'?[]:[{body:JSON.stringify({paymentId:'a',revenueStaffId:'old-manager',allocation:{storeAmount:300,developerAmount:200,shortfall:0}})},{body:JSON.stringify({paymentId:'b',revenueStaffId:'old-manager',allocation:{storeAmount:0,developerAmount:500,shortfall:0}})}]) as never);
  vi.mocked(tx.beautyPayment.findMany).mockResolvedValue([{id:'a',kind:'SALE',amount:500,createdAt:new Date('2026-10-01')},{id:'b',kind:'SALE',amount:500,createdAt:new Date('2026-10-02')},{id:'r',kind:'REFUND',originalPaymentId:'a',amount:-500,createdAt:new Date('2026-10-03')}] as never);
  vi.mocked(tx.$queryRaw).mockResolvedValue([{assignedStaffId:'new-manager'}]);
  await collect(tx,a,{requestKey:crypto.randomUUID(),ids:['b'],amounts:[500],method:'OTHER',note:'合成補收'});
  const event=vi.mocked(tx.beautyEvent.create).mock.calls.find(([arg])=>arg.data.kind==='SERVICE_SALE_ATTRIBUTION')![0].data;
  expect(JSON.parse(String(event.body))).toMatchObject({revenueStaffId:'new-manager',allocation:{storeAmount:300,developerAmount:200,shortfall:0}});
 }finally{vi.unstubAllEnvs();}
});

it('reconciles discounted cash receipts and repeated partial/full refund commands without double posting',async()=>{
 vi.stubEnv('BEAUTY_CHARGE_RULES_ENABLED','1');vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','s');vi.stubEnv('BEAUTY_CHARGE_RULES_SCOPE','stores');
 try{
  type Payment={id:string;kind:string;amount:number;appointmentId?:string|null;originalPaymentId?:string|null;createdAt:Date};
  const receipts:Payment[]=[],commands=new Map<string,unknown>(),events:{kind:string;body:string;appointmentId?:string|null}[]=[];
  let status='RESERVED';
  vi.mocked(tx.beautyCommand.findUnique).mockImplementation(({where})=>Promise.resolve(commands.get(where.storeId_requestKey!.requestKey)) as never);
  vi.mocked(tx.beautyCommand.create).mockImplementation(({data})=>{commands.set(data.requestKey,data);return Promise.resolve(data) as never;});
  vi.mocked(tx.beautyAppointment.findFirst).mockImplementation(()=>Promise.resolve({...b,cardId:null,status}) as never);
  tx.beautyAppointment.findFirstOrThrow=vi.fn().mockImplementation(async()=>({...b,cardId:null,status}));
  vi.mocked(tx.beautyPayment.findMany).mockImplementation(()=>Promise.resolve([...receipts]) as never);
  vi.mocked(tx.beautyPayment.findFirst).mockImplementation(({where}={})=>Promise.resolve(receipts.find(row=>row.id===where?.id&&row.kind==='SALE')) as never);
  vi.mocked(tx.beautyPayment.aggregate).mockImplementation(({where})=>Promise.resolve({_sum:{amount:receipts.filter(row=>row.kind==='REFUND'&&row.originalPaymentId===where?.originalPaymentId).reduce((n,row)=>n+row.amount,0)}}) as never);
  vi.mocked(tx.beautyPayment.create).mockImplementation(({data})=>{const row={...data,id:'p'+(receipts.length+1),createdAt:new Date('2026-10-01T01:00Z')} as Payment;receipts.push(row);return Promise.resolve(row) as never;});
  tx.beautyEvent.findFirst=vi.fn().mockResolvedValue({body:'{"storeCost":300}'});
  vi.mocked(tx.beautyEvent.create).mockImplementation(({data})=>{events.push(data as never);return Promise.resolve(data) as never;});
  vi.mocked(tx.beautyEvent.findMany).mockImplementation(({where}={})=>Promise.resolve(events.filter(row=>Array.isArray((where?.kind as {in?:string[]})?.in)?(where!.kind as {in:string[]}).in.includes(row.kind):row.kind===where?.kind)) as never);
  vi.mocked(tx.$queryRaw).mockImplementation((parts)=>Promise.resolve(Array.from(parts as TemplateStringsArray).join('').includes('CashDrawerSession')?[{id:'open-drawer'}]:[{assignedStaffId:'original-manager'}]) as never);
  const collection={requestKey:crypto.randomUUID(),ids:['b'],amounts:[900],method:'CASH' as const,note:'合成現金',quotes:[{id:'b',revision:0,price:1000,collected:0,discount:{kind:'AMOUNT' as const,value:100}}]};
  await collect(tx,a,collection,{canDiscount:true});await collect(tx,a,collection,{canDiscount:true});
  expect(receipts).toHaveLength(1);expect(receipts[0].amount).toBe(900);
  expect(JSON.parse(events.find(row=>row.kind==='SERVICE_SALE_ATTRIBUTION')!.body)).toMatchObject({allocation:{storeAmount:300,developerAmount:600},revenueStaffId:'original-manager'});
  status='CANCELLED';
  const partial={requestKey:crypto.randomUUID(),paymentId:'p1',amount:300,method:'CASH' as const,reason:'合成部分退款'};
  await refund(tx,a,partial,{remaining:null,refundedAmount:0});await refund(tx,a,partial,{remaining:null,refundedAmount:0});
  expect(receipts.map(row=>row.amount)).toEqual([900,-300]);
  const final={...partial,requestKey:crypto.randomUUID(),amount:600,reason:'合成全額退回'};
  await refund(tx,a,final,{remaining:null,refundedAmount:300});await refund(tx,a,final,{remaining:null,refundedAmount:300});
  expect(receipts.map(row=>row.amount)).toEqual([900,-300,-600]);
  await expect(refund(tx,a,{...final,requestKey:crypto.randomUUID(),amount:1},{remaining:null,refundedAmount:900})).rejects.toThrow('超過');
  const cashRows=vi.mocked(tx.$executeRaw).mock.calls.filter(([sql])=>Array.from(sql as TemplateStringsArray).join('').includes('INSERT INTO "CashbookEntry"'));
  expect(cashRows).toHaveLength(3);expect(cashRows.map(row=>row.slice(1))).toEqual([
   expect.arrayContaining(['beauty:p1','INCOME',900]),expect.arrayContaining(['beauty:p2','EXPENSE',300]),expect.arrayContaining(['beauty:p3','EXPENSE',600]),
  ]);
  expect(tx.beautyLedger.create).not.toHaveBeenCalled();expect(tx.beautyCard.update).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});
it('closes a partially refunded plan once and retains independent refund receipts for the remainder',async()=>{
 let closed=false,returned=0;
 vi.mocked(tx.beautyPayment.findFirst).mockResolvedValue({id:'original',kind:'SALE',amount:900,cardId:'card',appointmentId:null} as never);
 vi.mocked(tx.beautyPayment.aggregate).mockImplementation(()=>Promise.resolve({_sum:{amount:-returned}}) as never);
 vi.mocked(tx.beautyCard.findFirstOrThrow).mockImplementation(()=>Promise.resolve({...card,closedAt:closed?new Date():null}) as never);
 vi.mocked(tx.beautyCard.update).mockImplementation(()=>{closed=true;return Promise.resolve({}) as never;});
 vi.mocked(tx.beautyPayment.create).mockImplementation(({data})=>{returned-=Number(data.amount);return Promise.resolve({...data,id:'refund-'+returned}) as never;});
 await refund(tx,a,{requestKey:crypto.randomUUID(),paymentId:'original',amount:300,method:'OTHER',reason:'合成部分退回'},{remaining:2,refundedAmount:0});
 await refund(tx,a,{requestKey:crypto.randomUUID(),paymentId:'original',amount:600,method:'OTHER',reason:'合成剩餘退回'},{remaining:2,refundedAmount:300});
 expect(tx.beautyCard.update).toHaveBeenCalledTimes(1);expect(tx.beautyLedger.create).toHaveBeenCalledTimes(1);
 expect(tx.beautyLedger.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({kind:'REFUND',delta:-2})}));
 expect(tx.beautyPayment.create).toHaveBeenCalledTimes(2);expect(returned).toBe(900);
});
