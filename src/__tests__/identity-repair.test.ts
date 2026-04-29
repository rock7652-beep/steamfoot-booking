/**
 * Regression: identity repair on login.
 *
 * Goal: When a customer logs in (phone or OAuth), if there is exactly one
 * Customer in the same store matching by phone/email/lineUserId/googleId
 * with no userId binding, bind it. Anything ambiguous → skip, never throw.
 *
 * Scope locked by spec:
 *   - same store only (no cross-store merge)
 *   - single match required (multi → skip)
 *   - never overwrite an existing Customer.userId
 *   - errors are swallowed (login flow must not break)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const USER_ID = "user-1";

const mockCustomerFindMany = vi.fn();
const mockCustomerUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
      update: (...a: unknown[]) => mockCustomerUpdate(...a),
    },
  },
}));

beforeEach(() => {
  mockCustomerFindMany.mockReset();
  mockCustomerUpdate.mockReset();
});

describe("repairCustomerIdentityOnLogin", () => {
  it("skip-no-input：沒任何 identity marker → skip", async () => {
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
    });
    expect(r.action).toBe("skip-no-input");
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("skip-no-match：同店找不到任何 Customer → skip", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([]);
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      phone: "0912345678",
    });
    expect(r.action).toBe("skip-no-match");
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("bound：單筆 + userId 為 null → 安全綁定", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "c1", userId: null },
    ]);
    mockCustomerUpdate.mockResolvedValueOnce({ id: "c1", userId: USER_ID });
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      phone: "0912345678",
    });
    expect(r.action).toBe("bound");
    expect(r.customerId).toBe("c1");
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { userId: USER_ID },
    });
  });

  it("synced：單筆已綁到同 user → no-op", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "c1", userId: USER_ID },
    ]);
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      lineUserId: "U-line-1",
    });
    expect(r.action).toBe("synced");
    expect(r.customerId).toBe("c1");
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("skip-conflict：單筆已綁別人 → 不動 (no hijack)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "c1", userId: "other-user-2" },
    ]);
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      email: "x@example.com",
    });
    expect(r.action).toBe("skip-conflict");
    expect(r.customerId).toBeNull();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("skip-multi：同店命中 2 筆（髒資料）→ 不綁", async () => {
    // 驗收第 6 條：同一支手機在同店有兩筆 Customer 不應自動綁
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "c1", userId: USER_ID },
      { id: "c2", userId: null },
    ]);
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      phone: "0912345678",
    });
    expect(r.action).toBe("skip-multi");
    expect(r.customerId).toBeNull();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("skip-error：findMany 噴錯 → 吞掉，回 skip-error，不 throw", async () => {
    mockCustomerFindMany.mockRejectedValueOnce(new Error("DB down"));
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      phone: "0912345678",
    });
    expect(r.action).toBe("skip-error");
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("skip-error：update 噴錯 → 吞掉（登入主流程仍可繼續）", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "c1", userId: null },
    ]);
    mockCustomerUpdate.mockRejectedValueOnce(new Error("FK violation"));
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    const r = await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      lineUserId: "U-line-1",
    });
    expect(r.action).toBe("skip-error");
  });

  it("findMany where 包含同店 + OR 多個 marker", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([]);
    const { repairCustomerIdentityOnLogin } = await import("@/lib/identity-repair");
    await repairCustomerIdentityOnLogin({
      userId: USER_ID,
      storeId: STORE_A,
      phone: "0912345678",
      lineUserId: "U-line-1",
      email: "x@example.com",
    });
    const call = mockCustomerFindMany.mock.calls[0]?.[0];
    expect(call).toBeTruthy();
    expect(call.where.storeId).toBe(STORE_A);
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { phone: "0912345678" },
        { lineUserId: "U-line-1" },
        { email: "x@example.com" },
      ]),
    );
    expect(call.take).toBe(2);
  });
});
