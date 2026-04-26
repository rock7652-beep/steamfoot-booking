/**
 * Regression: LINE OAuth 顧客身份解析 — single source via lineUserId
 *
 * 防止以下歷史 bug 復發（2026 Q2「芊芊」案例）：
 *   - 顧客手動 DB merge 後，正確 Customer 帶有 phone/email/lineUserId，
 *     但因 Customer.userId 為 null + session.email 為 null，
 *     resolveCustomerForUser 走完 A/B/email/phone 全部 miss → not_found，
 *     gate 誤判「請補資料」，再次 LINE 登入仍卡住。
 *
 * 守則（Case A）：
 *   1. session 已有 sessionCustomerId 直查命中 → reason=found_by_id（不動到 lineUserId 路徑）
 *   2. session.userId 已綁到 Customer → reason=found_by_userid（步驟 B）
 *   3. 若 Customer.userId=null 但同店 (lineUserId) 命中 → 自動 bind userId、
 *      reason=bound_by_line_user_id（步驟 C，新增）
 *   4. 若 (lineUserId) 命中但 userId 已被別的 user 佔用 → conflict_already_linked_line_user_id
 *   5. 沒 LINE Account / 沒 lineUserId 命中 → 繼續走 email / phone（步驟 D / E）
 *
 * 守則（findRealCustomerForMerge — Case B 防回歸）：
 *   - lineUserId 為第 2 層 merge 信號，profile completion 必須帶入，否則
 *     LINE placeholder 補資料時可能漏接真人 Customer。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const USER_ID = "ck0000000000000000000010";
const OTHER_USER_ID = "ck0000000000000000000011";
const REAL_CUSTOMER_ID = "ck0000000000000000000001";
const LINE_USER_ID = "U_line_qianqian_0001";

const mockCustomerFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockAccountFindFirst = vi.fn();

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
  // findFirst 多個 callsite — 每個 case 自己 setup
});

describe("resolveCustomerForUser — Step C (lineUserId)", () => {
  it("Case A1：Customer 已有 lineUserId，userId=null → 自動 bind 並回傳 bound_by_line_user_id", async () => {
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
    mockCustomerUpdate.mockResolvedValue({});

    const result: ResolveResult = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: null,
      storeId: STORE_A,
      provider: "line",
    });

    expect(result.reason).toBe("bound_by_line_user_id");
    expect(result.customer?.id).toBe(REAL_CUSTOMER_ID);
    expect(result.customer?.userId).toBe(USER_ID);
    // 應呼叫 update 把 userId 寫回
    expect(mockCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REAL_CUSTOMER_ID },
        data: { userId: USER_ID },
      }),
    );
  });

  it("Case A2：Customer 已有 lineUserId 且 userId 就是當前 user → 直接回傳，不重複 update", async () => {
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

    expect(result.reason).toBe("bound_by_line_user_id");
    expect(result.customer?.id).toBe(REAL_CUSTOMER_ID);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("Case A3：lineUserId 命中但 Customer.userId 是別的 user → conflict_already_linked_line_user_id", async () => {
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

    expect(result.reason).toBe("conflict_already_linked_line_user_id");
    expect(result.customer).toBeNull();
    expect(result.conflict).toBe(true);
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
    mockCustomerUpdate.mockResolvedValue({});

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: null,
      sessionEmail: "qianqian@example.com",
      storeId: STORE_A,
    });

    expect(result.reason).toBe("bound_by_email");
    expect(result.customer?.id).toBe(REAL_CUSTOMER_ID);
  });

  it("regression：sessionCustomerId 直查命中時，不應觸發 LINE Account 查詢（A 路徑優先）", async () => {
    mockCustomerFindUnique.mockResolvedValue(baseCustomer);

    const result = await resolveCustomerForUser({
      userId: USER_ID,
      sessionCustomerId: REAL_CUSTOMER_ID,
      sessionEmail: null,
      storeId: STORE_A,
    });

    expect(result.reason).toBe("found_by_id");
    expect(mockAccountFindFirst).not.toHaveBeenCalled();
  });
});
