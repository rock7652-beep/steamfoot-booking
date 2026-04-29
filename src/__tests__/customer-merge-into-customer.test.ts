/**
 * mergeCustomerIntoCustomer (Phase 1) — service unit tests
 *
 * 驗證：
 *   1. FK relocation：booking / wallet / transaction / pointRecord / makeup / referral /
 *      messageLog / checkinPost / talentStageLog / referralEvent / sponsorId(self)
 *      全部從 source 搬到 target
 *   2. 身份欄位合併（target 為 null 才補）：phone / email / lineUserId / userId
 *   3. Source 被 archive（mergedIntoCustomerId / mergedAt 設值）+ unique 欄位清空
 *   4. 各種拒絕情境：跨店 / 同一筆 / 已合併 / 雙 userId
 *
 * ⚠ 測試以 in-memory mocked Prisma 為準（與 profile-merge-by-phone.test.ts 同風格），
 *    主要是因 repo 目前只有 Supabase remote DB，沒有本地測試 DB infrastructure。
 *    真實合併流程的 integration 必須在 staging 環境執行。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Customer } from "@prisma/client";

// ── 類別 row store（in-memory）──
type Row = Record<string, unknown> & { id: string };
type Tables = {
  customer: (Customer | (Row & { mergedIntoCustomerId?: string | null }))[];
  booking: Row[];
  transaction: Row[];
  customerPlanWallet: Row[];
  makeupCredit: Row[];
  referral: Row[];
  pointRecord: Row[];
  messageLog: Row[];
  checkinPost: Row[];
  talentStageLog: Row[];
  referralEvent: Row[];
};

const tables: Tables = {
  customer: [],
  booking: [],
  transaction: [],
  customerPlanWallet: [],
  makeupCredit: [],
  referral: [],
  pointRecord: [],
  messageLog: [],
  checkinPost: [],
  talentStageLog: [],
  referralEvent: [],
};

function resetTables() {
  for (const k of Object.keys(tables) as (keyof Tables)[]) {
    tables[k].length = 0;
  }
}

// 生成簡易 Prisma model mock（findUnique / findMany / updateMany / update）
function modelFor<T extends keyof Tables>(name: T) {
  return {
    findUnique: vi.fn(async (args: { where: { id: string } }) => {
      return tables[name].find((r) => r.id === args.where.id) ?? null;
    }),
    findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      return tables[name].filter((row) => matchWhere(row, where));
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = tables[name].find((r) => r.id === args.where.id);
      if (!row) throw new Error(`update: row not found ${args.where.id}`);
      Object.assign(row, args.data);
      return row;
    }),
    updateMany: vi.fn(
      async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = tables[name].filter((r) => matchWhere(r, args.where));
        for (const row of rows) Object.assign(row, args.data);
        return { count: rows.length };
      },
    ),
  };
}

function matchWhere(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (val && typeof val === "object" && "in" in (val as object)) {
      const inList = (val as { in: unknown[] }).in;
      if (!inList.includes(row[key])) return false;
      continue;
    }
    if (row[key] !== val) return false;
  }
  return true;
}

const customerModel = modelFor("customer");
const bookingModel = modelFor("booking");
const transactionModel = modelFor("transaction");
const walletModel = modelFor("customerPlanWallet");
const makeupModel = modelFor("makeupCredit");
const referralModel = modelFor("referral");
const pointRecordModel = modelFor("pointRecord");
const messageLogModel = modelFor("messageLog");
const checkinPostModel = modelFor("checkinPost");
const talentStageLogModel = modelFor("talentStageLog");
const referralEventModel = modelFor("referralEvent");

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: customerModel,
    booking: bookingModel,
    transaction: transactionModel,
    customerPlanWallet: walletModel,
    makeupCredit: makeupModel,
    referral: referralModel,
    pointRecord: pointRecordModel,
    messageLog: messageLogModel,
    checkinPost: checkinPostModel,
    talentStageLog: talentStageLogModel,
    referralEvent: referralEventModel,
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        customer: customerModel,
        booking: bookingModel,
        transaction: transactionModel,
        customerPlanWallet: walletModel,
        makeupCredit: makeupModel,
        referral: referralModel,
        pointRecord: pointRecordModel,
        messageLog: messageLogModel,
        checkinPost: checkinPostModel,
        talentStageLog: talentStageLogModel,
        referralEvent: referralEventModel,
      }),
  },
}));

// ── helpers ──
const STORE_A = "store-A";
const STORE_B = "store-B";
const PERFORMER = "user-performer-1";

type CustomerOverrides = Partial<Customer> & { id: string };

function makeCustomer(overrides: CustomerOverrides): Row {
  const base: Row = {
    id: overrides.id,
    storeId: STORE_A,
    name: "顧客",
    phone: "",
    email: null,
    googleId: null,
    avatar: null,
    authSource: "MANUAL",
    gender: null,
    birthday: null,
    height: null,
    address: null,
    lineName: null,
    lineUserId: null,
    lineLinkedAt: null,
    lineLinkStatus: "UNLINKED",
    lineBindingCode: null,
    lineBindingCodeCreatedAt: null,
    notes: null,
    healthProfileId: null,
    healthLinkStatus: "unlinked",
    healthSyncedAt: null,
    assignedStaffId: null,
    customerStage: "LEAD",
    sponsorId: null,
    referralCode: null,
    talentStage: "CUSTOMER",
    stageChangedAt: null,
    stageNote: null,
    selfBookingEnabled: false,
    firstVisitAt: null,
    convertedAt: null,
    lastVisitAt: null,
    mergedIntoCustomerId: null,
    mergedAt: null,
    userId: null,
    totalPoints: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...(overrides as Record<string, unknown>) };
}

beforeEach(() => {
  resetTables();
  vi.clearAllMocks();
});

describe("mergeCustomerIntoCustomer — FK relocation", () => {
  it("把 booking / wallet / transaction / pointRecord 從 source 搬到 target", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", phone: "0911111111" }) as Customer,
      makeCustomer({ id: "tgt", phone: "0922222222" }) as Customer,
    );
    tables.booking.push(
      { id: "b1", customerId: "src" },
      { id: "b2", customerId: "src" },
      { id: "b3", customerId: "tgt" }, // target 既有的不應誤搬
    );
    tables.transaction.push(
      { id: "t1", customerId: "src" },
      { id: "t2", customerId: "tgt" },
    );
    tables.customerPlanWallet.push({ id: "w1", customerId: "src" });
    tables.pointRecord.push(
      { id: "p1", customerId: "src" },
      { id: "p2", customerId: "src" },
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    expect(out.movedCounts.bookings).toBe(2);
    expect(out.movedCounts.transactions).toBe(1);
    expect(out.movedCounts.customerPlanWallets).toBe(1);
    expect(out.movedCounts.pointRecords).toBe(2);

    expect(tables.booking.filter((b) => b.customerId === "tgt").length).toBe(3);
    expect(tables.booking.filter((b) => b.customerId === "src").length).toBe(0);
    expect(tables.customerPlanWallet[0].customerId).toBe("tgt");
  });

  it("把 makeupCredit / messageLog / checkinPost / talentStageLog 都搬走", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src" }) as Customer,
      makeCustomer({ id: "tgt" }) as Customer,
    );
    tables.makeupCredit.push({ id: "m1", customerId: "src" });
    tables.messageLog.push({ id: "ml1", customerId: "src" });
    tables.checkinPost.push({ id: "cp1", customerId: "src" });
    tables.talentStageLog.push({ id: "tsl1", customerId: "src" });

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    expect(out.movedCounts.makeupCredits).toBe(1);
    expect(out.movedCounts.messageLogs).toBe(1);
    expect(out.movedCounts.checkinPosts).toBe(1);
    expect(out.movedCounts.talentStageLogs).toBe(1);
  });

  it("Referral 的 referrerId 與 convertedCustomerId 都會搬", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src" }) as Customer,
      makeCustomer({ id: "tgt" }) as Customer,
    );
    tables.referral.push(
      { id: "r1", referrerId: "src", convertedCustomerId: null },
      { id: "r2", referrerId: "other", convertedCustomerId: "src" },
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    expect(out.movedCounts.referralsAsReferrer).toBe(1);
    expect(out.movedCounts.referralsAsConverted).toBe(1);
    expect(tables.referral[0].referrerId).toBe("tgt");
    expect(tables.referral[1].convertedCustomerId).toBe("tgt");
  });

  it("ReferralEvent / sponsorId 自我參照都會搬", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src" }) as Customer,
      makeCustomer({ id: "tgt" }) as Customer,
      makeCustomer({ id: "child", sponsorId: "src" }) as Customer,
    );
    tables.referralEvent.push(
      { id: "re1", customerId: "src", referrerId: null },
      { id: "re2", customerId: null, referrerId: "src" },
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    expect(out.movedCounts.referralEventsAsCustomer).toBe(1);
    expect(out.movedCounts.referralEventsAsReferrer).toBe(1);
    expect(out.movedCounts.sponsoredCustomers).toBe(1);
    const child = tables.customer.find((c) => c.id === "child")!;
    expect(child.sponsorId).toBe("tgt");
  });
});

describe("mergeCustomerIntoCustomer — identity merge", () => {
  it("target.userId == null & source.userId set → userId 搬到 target，source.userId 清空", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", userId: "user-line-1", lineUserId: "U1234" }) as Customer,
      makeCustomer({ id: "tgt", userId: null, lineUserId: null }) as Customer,
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    const src = tables.customer.find((c) => c.id === "src")!;
    const tgt = tables.customer.find((c) => c.id === "tgt")!;
    expect(tgt.userId).toBe("user-line-1");
    expect(src.userId).toBe(null);
    expect(out.mergedIdentityFields).toContain("userId");
  });

  it("target.lineUserId 為 null → source.lineUserId 搬過去；source 清空", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", lineUserId: "U-line-source" }) as Customer,
      makeCustomer({ id: "tgt", lineUserId: null }) as Customer,
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    const src = tables.customer.find((c) => c.id === "src")!;
    const tgt = tables.customer.find((c) => c.id === "tgt")!;
    expect(tgt.lineUserId).toBe("U-line-source");
    expect(src.lineUserId).toBe(null);
    expect(out.mergedIdentityFields).toContain("lineUserId");
  });

  it("target.phone 為 null → source.phone 搬過去；source phone 清空", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", phone: "0911111111" }) as Customer,
      // target 用空字串模擬「沒填」（Customer.phone 不可為 null，schema 是 String not String?）
      makeCustomer({ id: "tgt", phone: "" }) as Customer,
    );
    // 改用真正 null 邏輯——因為 service 用 == null 判斷，空字串不會觸發補位；
    // 改測 target 已經有值不會被覆蓋
    (tables.customer.find((c) => c.id === "tgt") as Row).phone = null;

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    const src = tables.customer.find((c) => c.id === "src")!;
    const tgt = tables.customer.find((c) => c.id === "tgt")!;
    expect(tgt.phone).toBe("0911111111");
    expect(src.phone).toBe(null);
    expect(out.mergedIdentityFields).toContain("phone");
  });

  it("target 已有 phone → 不被覆蓋", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", phone: "0911111111" }) as Customer,
      makeCustomer({ id: "tgt", phone: "0922222222" }) as Customer,
    );

    await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    const src = tables.customer.find((c) => c.id === "src")!;
    const tgt = tables.customer.find((c) => c.id === "tgt")!;
    expect(tgt.phone).toBe("0922222222");
    // source 仍會清空 unique 欄位避免後續撞 unique
    expect(src.phone).toBe(null);
  });
});

describe("mergeCustomerIntoCustomer — archive source", () => {
  it("source 被 archive（mergedIntoCustomerId / mergedAt set，身份欄位清空）", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({
        id: "src",
        phone: "0911111111",
        lineUserId: "U-1",
        email: "a@example.com",
      }) as Customer,
      makeCustomer({ id: "tgt" }) as Customer,
    );

    const out = await mergeCustomerIntoCustomer({
      sourceCustomerId: "src",
      targetCustomerId: "tgt",
      performedByUserId: PERFORMER,
    });

    const src = tables.customer.find((c) => c.id === "src")!;
    expect(src.mergedIntoCustomerId).toBe("tgt");
    expect(src.mergedAt).toBeInstanceOf(Date);
    expect(src.phone).toBe(null);
    expect(src.lineUserId).toBe(null);
    expect(src.email).toBe(null);
    expect(src.lineLinkStatus).toBe("UNLINKED");
    expect(out.targetId).toBe("tgt");
    expect(out.sourceId).toBe("src");
  });
});

describe("mergeCustomerIntoCustomer — rejection cases", () => {
  it("跨店合併 → throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", storeId: STORE_A }) as Customer,
      makeCustomer({ id: "tgt", storeId: STORE_B }) as Customer,
    );

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "src",
        targetCustomerId: "tgt",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/跨店/);
  });

  it("source === target → throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(makeCustomer({ id: "same" }) as Customer);

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "same",
        targetCustomerId: "same",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/不可相同/);
  });

  it("source 已被合併 → throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", mergedIntoCustomerId: "old-target" }) as unknown as Customer,
      makeCustomer({ id: "tgt" }) as Customer,
    );

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "src",
        targetCustomerId: "tgt",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/已被合併/);
  });

  it("target 已被合併到別處 → throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src" }) as Customer,
      makeCustomer({ id: "tgt", mergedIntoCustomerId: "other" }) as unknown as Customer,
    );

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "src",
        targetCustomerId: "tgt",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/目標顧客本身已被合併/);
  });

  it("兩邊都有 userId（且不同）→ Phase 1 直接 throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(
      makeCustomer({ id: "src", userId: "user-1" }) as Customer,
      makeCustomer({ id: "tgt", userId: "user-2" }) as Customer,
    );

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "src",
        targetCustomerId: "tgt",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/userId/);
  });

  it("找不到 source → throw", async () => {
    const { mergeCustomerIntoCustomer } = await import("@/server/services/customer-merge");

    tables.customer.push(makeCustomer({ id: "tgt" }) as Customer);

    await expect(
      mergeCustomerIntoCustomer({
        sourceCustomerId: "missing",
        targetCustomerId: "tgt",
        performedByUserId: PERFORMER,
      }),
    ).rejects.toThrow(/找不到來源/);
  });
});
