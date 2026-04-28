/**
 * Regression: checkPhoneStatus 的「Customer 已存在但 User 不齊」場景必須回
 * needs_activation，不可漏到 not_found 讓店家手動建立的會員被擋在登入入口外。
 *
 * 同店規則：storeId + phone = 同一位顧客（與 profile.ts merge 契約一致）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const PHONE = "0972756667";

const mockCustomerFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...a: unknown[]) => mockCustomerFindFirst(...a),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

// store-resolver 不在這支 unit test 範圍 — 直接給回固定 store
vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: vi.fn(async () => ({ id: STORE_A })),
}));

// 避開 next-auth chain — checkPhoneStatus 不會用到 signIn / email
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendActivationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function call(phone: string, storeId?: string) {
  const { checkPhoneStatus } = await import("@/server/actions/account");
  return checkPhoneStatus(phone, storeId);
}

describe("checkPhoneStatus — 三態判定", () => {
  it("Customer 不存在 → not_found（才是真的未註冊）", async () => {
    mockCustomerFindFirst.mockResolvedValue(null);
    const r = await call(PHONE, STORE_A);
    expect(r).toEqual({ status: "not_found" });
  });

  it("Customer 存在但 userId 為 null（店長手動建會員）→ needs_activation", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: null,
      userId: null,
      user: null,
    });
    const r = await call(PHONE, STORE_A);
    expect(r).toEqual({
      status: "needs_activation",
      customerName: "黃彥陸",
      hasEmail: false,
    });
  });

  it("Customer 存在、userId 有值但 user row 已刪 → needs_activation（曾漏到 not_found）", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: "huang@example.com",
      userId: "user-deleted-id",
      user: null, // 關聯使用者已被刪
    });
    const r = await call(PHONE, STORE_A);
    expect(r).toMatchObject({
      status: "needs_activation",
      customerName: "黃彥陸",
      hasEmail: true,
    });
  });

  it("Customer 存在、user ACTIVE 但 passwordHash 為 null → needs_activation（OAuth 登入過、還沒設密碼）", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: null,
      userId: "user-id",
      user: { status: "ACTIVE", passwordHash: null },
    });
    const r = await call(PHONE, STORE_A);
    expect(r).toMatchObject({ status: "needs_activation", customerName: "黃彥陸" });
  });

  it("Customer 存在、user INACTIVE → needs_activation", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: null,
      userId: "user-id",
      user: { status: "INACTIVE", passwordHash: "$2b$10$abc" },
    });
    const r = await call(PHONE, STORE_A);
    expect(r).toMatchObject({ status: "needs_activation", customerName: "黃彥陸" });
  });

  it("Customer + ACTIVE user + passwordHash → active（才顯示密碼欄位）", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: null,
      userId: "user-id",
      user: { status: "ACTIVE", passwordHash: "$2b$10$abc" },
    });
    const r = await call(PHONE, STORE_A);
    expect(r).toEqual({ status: "active", customerName: "黃彥陸" });
  });

  it("帶連字號的手機號碼會被 normalize 後再查（0972-756-667）", async () => {
    mockCustomerFindFirst.mockResolvedValue({
      name: "黃彥陸",
      email: null,
      userId: null,
      user: null,
    });
    await call("0972-756-667", STORE_A);
    const where = (
      mockCustomerFindFirst.mock.calls[0][0] as {
        where: { phone: string; storeId: string };
      }
    ).where;
    expect(where.phone).toBe("0972756667");
    expect(where.storeId).toBe(STORE_A);
  });

  it("格式不正確的號碼 → not_found（不會打 DB）", async () => {
    const r = await call("12345", STORE_A);
    expect(r).toEqual({ status: "not_found" });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });
});
