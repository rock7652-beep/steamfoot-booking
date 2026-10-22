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
import { refund, collect, voidFee } from "@/server/beauty/commerce";
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
    beautyCommand: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    beautyEvent: { create: vi.fn() },
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
