/**
 * Regression: LINE OAuth 顧客身份解析 — explicit Login identity links only
 *
 * 防止以下歷史 bug 復發（2026 Q2「芊芊」案例）：
 *   - LINE Messaging API 和 LINE Login 對同一真人會發出不同 user ID；
 *     Customer.lineUserId 不可被拿來當 LINE Login subject 查找或回寫。
 *
 * 守則：CustomerIdentityLink 才能把已驗證的 LINE Login subject 接回 Customer；
 * legacy Customer.lineUserId 僅供 Messaging API 使用，必須被忽略。
 *
 * 守則（findRealCustomerForMerge — Case B 防回歸）：
 *   - lineUserId 為第 2 層 merge 信號，profile completion 必須帶入，否則
 *     LINE placeholder 補資料時可能漏接真人 Customer。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const STORE_B = "store-hsinchu";
const USER_ID = "ck0000000000000000000010";
const OTHER_USER_ID = "ck0000000000000000000011";
const REAL_CUSTOMER_ID = "ck0000000000000000000001";
const LINE_USER_ID = "U_line_qianqian_0001";

const mockCustomerFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockAccountFindFirst = vi.fn();
const mockIdentityLinkFindUnique = vi.fn();
const mockIdentityLinkFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
      findFirst: (...a: unknown[]) => mockCustomerFindFirst(...a),
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
      update: (...a: unknown[]) => mockCustomerUpdate(...a),
    },
    account: {
      findFirst: (...a: unknown[]) => mockAccountFindFirst(...a),
    },
    customerIdentityLink: {
      findUnique: (...a: unknown[]) => mockIdentityLinkFindUnique(...a),
      findMany: (...a: unknown[]) => mockIdentityLinkFindMany(...a),
    },
  },
}));

vi.mock("@/lib/normalize", () => ({
  normalizePhone: (s: string) => s,
}));

import {
  resolveCustomerForUser,
  type ResolveResult,
} from "@/server/queries/customer-completion";

const baseCustomer = {
  id: REAL_CUSTOMER_ID,
  name: "芊芊",
  phone: "0988009145",
  email: "qianqian@example.com",
  birthday: new Date("1995-01-01"),
  gender: "female",
  storeId: STORE_A,
  userId: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // 預設：沒有 sessionCustomerId 命中、沒有 userId 命中
  mockCustomerFindUnique.mockResolvedValue(null);
  mockCustomerFindMany.mockResolvedValue([]);
  mockIdentityLinkFindUnique.mockResolvedValue(null);
  mockIdentityLinkFindMany.mockResolvedValue([]);
  mockCustomerUpdate.mockResolvedValue({ ...baseCustomer, userId: USER_ID });
  // findFirst 多個 callsite — 每個 case 自己 setup
});

describe("resolveCustomerForUser — LINE Login identity boundary", () => {
  it("does not bind a Messaging API ID as a LINE Login subject", async () => {
    // step B (userId 找不到 customer)
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && !where.lineUserId) return null;
      // step C：lineUserId 命中
      if (where.storeId === STORE_A && where.lineUserId === LINE_USER_ID) {
        return { ...baseCustomer, userId: null };
      }
      return null;
    });
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });
    mockCustomerUpdate.mockResolvedValue({ ...baseCustomer, userId: USER_ID });

    const result: ResolveResult = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
      provider: "line",
    });

    expect(result).toMatchObject({ reason: "not_found", customer: null });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("does not treat a Messaging API ID as a current Login session either", async () => {
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && !where.lineUserId) return null;
      if (where.storeId === STORE_A && where.lineUserId === LINE_USER_ID) {
        return { ...baseCustomer, userId: USER_ID };
      }
      return null;
    });
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
    });

    expect(result).toMatchObject({ reason: "not_found", customer: null });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("does not disclose a conflict solely because Messaging ID happens to differ", async () => {
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && !where.lineUserId) return null;
      if (where.storeId === STORE_A && where.lineUserId === LINE_USER_ID) {
        return { ...baseCustomer, userId: OTHER_USER_ID };
      }
      return null;
    });
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
    });

    expect(result.reason).toBe("not_found");
    expect(result.customer).toBeNull();
    expect(result.conflict).toBeUndefined();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("Case A4：lineUserId 嚴格同店 — 全站他店有同 lineUserId，但目標店沒有 → 不命中，繼續往下走", async () => {
    // step B miss, step C miss（即使他店有 — 這個 query 是 storeId+lineUserId 組合）
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // step B：userId
      if (where.userId === USER_ID && !where.lineUserId) return null;
      // step C：嚴格 storeId + lineUserId
      if (where.storeId === STORE_A && where.lineUserId === LINE_USER_ID) return null;
      return null;
    });
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
    });

    // 沒命中 → 走 D/E 也都 miss → not_found
    expect(result.reason).toBe("not_found");
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("Case A5：user 沒綁 LINE Account → 跳過 step C，走 email path", async () => {
    mockAccountFindFirst.mockResolvedValue(null); // 沒 LINE Account
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID) return null;
      return null;
    });
    mockCustomerFindMany.mockResolvedValue([
      { ...baseCustomer, userId: null },
    ]);
    mockCustomerUpdate.mockResolvedValue({ ...baseCustomer, userId: USER_ID });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: "qianqian@example.com",
      storeId: STORE_A,
    });

    expect(result.reason).toBe("bound_by_email");
    expect(result.customer?.id).toBe(REAL_CUSTOMER_ID);
  });

  it("regression：sessionCustomerId 直查命中且 userId 已綁當前 user → reason=found_by_id（不觸發 LINE Account 查詢）", async () => {
    mockCustomerFindUnique.mockResolvedValue({ ...baseCustomer, userId: USER_ID });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: REAL_CUSTOMER_ID,
      sessionEmail: null,
      storeId: STORE_A,
    });

    expect(result.reason).toBe("found_by_id");
    expect(mockAccountFindFirst).not.toHaveBeenCalled();
  });

  it("PR-1：有 store context 時，legacy Customer.userId 只能同店命中，避免跨店解析錯 Customer", async () => {
    mockCustomerFindUnique.mockResolvedValue(null); // path A miss
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && where.storeId === undefined && !where.lineUserId) {
        return { ...baseCustomer, userId: USER_ID, storeId: "real-store-uuid" };
      }
      return null;
    });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: "default-store", // ← stale 字串值
    });

    expect(result.reason).toBe("not_found");
    expect(result.customer).toBeNull();
    expect(mockCustomerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, storeId: "default-store" },
      }),
    );
  });

  it("PR-1：同一 LINE User 在不同 store 透過 CustomerIdentityLink 解析到該店 Customer", async () => {
    const hsinchuCustomer = {
      ...baseCustomer,
      id: "cust-hsinchu",
      storeId: STORE_B,
      userId: null,
    };
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });
    mockIdentityLinkFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const providerKey = where.uq_customer_identity_provider_store as
        | { storeId?: string }
        | undefined;
      if (providerKey?.storeId === STORE_B) {
        return { customer: hsinchuCustomer };
      }
      return null;
    });
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // Legacy Customer.userId still points to A 店; B 店解析不可被拉回 A 店。
      if (where.userId === USER_ID && where.storeId === STORE_A) {
        return { ...baseCustomer, userId: USER_ID, storeId: STORE_A };
      }
      throw new Error(`legacy fallback should not run before identity link: ${JSON.stringify(where)}`);
    });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_B,
      provider: "line",
    });

    expect(result.reason).toBe("found_by_identity_link");
    expect(result.customer?.id).toBe("cust-hsinchu");
    expect(result.customer?.storeId).toBe(STORE_B);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("PR-1：同一 providerAccountId 可依 storeId 命中不同 CustomerIdentityLink", async () => {
    const zhubeiCustomer = { ...baseCustomer, id: "cust-zhubei", storeId: STORE_A };
    const hsinchuCustomer = { ...baseCustomer, id: "cust-hsinchu", storeId: STORE_B };
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });
    mockIdentityLinkFindUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const providerKey = where.uq_customer_identity_provider_store as
        | { providerAccountId?: string; storeId?: string }
        | undefined;
      if (providerKey?.providerAccountId !== LINE_USER_ID) return null;
      if (providerKey.storeId === STORE_A) return { customer: zhubeiCustomer };
      if (providerKey.storeId === STORE_B) return { customer: hsinchuCustomer };
      return null;
    });

    const zhubei = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
      provider: "line",
    });
    const hsinchu = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_B,
      provider: "line",
    });

    expect(zhubei.reason).toBe("found_by_identity_link");
    expect(zhubei.customer?.id).toBe("cust-zhubei");
    expect(hsinchu.reason).toBe("found_by_identity_link");
    expect(hsinchu.customer?.id).toBe("cust-hsinchu");
  });

  it("PR-1：沒有 CustomerIdentityLink 時，才 fallback 到同店 legacy Customer.userId", async () => {
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });
    mockIdentityLinkFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && where.storeId === STORE_A && !where.lineUserId) {
        return { ...baseCustomer, userId: USER_ID };
      }
      return null;
    });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
      provider: "line",
    });

    expect(result.reason).toBe("found_by_userid");
    expect(result.customer?.id).toBe(REAL_CUSTOMER_ID);
  });

  it("does not fall back to Customer.lineUserId when an identity link is absent", async () => {
    const lineMatchedCustomer = { ...baseCustomer, userId: null };
    mockAccountFindFirst.mockResolvedValue({ providerAccountId: LINE_USER_ID });
    mockIdentityLinkFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && where.storeId === STORE_A && !where.lineUserId) return null;
      if (where.storeId === STORE_A && where.lineUserId === LINE_USER_ID) return lineMatchedCustomer;
      return null;
    });
    mockCustomerUpdate.mockResolvedValue({});

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
      provider: "line",
    });

    expect(result).toMatchObject({ reason: "not_found", customer: null });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("regression：sessionCustomerId 命中 row 但 userId 不符（merge 後 placeholder）→ 視為 stale，fall through 不回傳 placeholder", async () => {
    // Scenario: OAuth 首登建 placeholder（userId=user.id, phone=_oauth_xxx），
    // /profile merge 進真人 row 後 placeholder.userId 被清成 null（phone 仍是
    // _oauth_xxx），但 JWT.customerId 還沒刷新仍指向 placeholder。
    // 必須 fall through 到 path B/C，避免命中已沒綁定的 placeholder 造成 gate
    // 誤判 phone 缺漏 → /profile 死循環。
    const placeholder = { ...baseCustomer, userId: null, phone: "_oauth_line_xxxx" };
    mockCustomerFindUnique.mockResolvedValue(placeholder);
    // path B：userId 找到真人 row（merge 後 userId 從 placeholder 搬到 real）
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === USER_ID && !where.lineUserId) {
        return { ...baseCustomer, userId: USER_ID, phone: "0988009145" };
      }
      return null;
    });

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: "ck_old_placeholder_id",
      sessionEmail: null,
      storeId: STORE_A,
    });

    expect(result.reason).toBe("found_by_userid");
    expect(result.customer?.phone).toBe("0988009145");
  });
});
