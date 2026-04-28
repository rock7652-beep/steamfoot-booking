/**
 * Regression: 店長先建會員後，顧客前台用同手機補資料時必須合併到原 Customer，
 * 不可新增第二筆。同時驗證首次補資料會把密碼寫入 User.passwordHash。
 *
 * 守則：
 *   1. 同店 storeId + phone 是唯一身份 — admin 已建的 Customer 即為 real，placeholder
 *      / 找不到 existing 時都應路由到 mergePlaceholderCustomerIntoRealCustomer
 *   2. 不可呼叫 prisma.customer.create
 *   3. user.passwordHash 為 null 時，password 必填且寫入；hash 以 $2 開頭（bcryptjs）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { compareSync } from "bcryptjs";

const STORE_A = "store-zhubei";
const ADMIN_CUSTOMER_ID = "ck0000000000000000000001";
const USER_ID = "ck0000000000000000000010";

// ── Prisma mocks ─────────────────────────────────────────
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserCreate = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerCreate = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockStoreFindUnique = vi.fn();
const mockAccountFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      update: (...a: unknown[]) => mockUserUpdate(...a),
      create: (...a: unknown[]) => mockUserCreate(...a),
    },
    customer: {
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
      findFirst: (...a: unknown[]) => mockCustomerFindFirst(...a),
      create: (...a: unknown[]) => mockCustomerCreate(...a),
      update: (...a: unknown[]) => mockCustomerUpdate(...a),
    },
    store: {
      findUnique: (...a: unknown[]) => mockStoreFindUnique(...a),
    },
    account: {
      findFirst: (...a: unknown[]) => mockAccountFindFirst(...a),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    id: USER_ID,
    role: "CUSTOMER",
    email: "user@example.com",
    storeId: STORE_A,
    customerId: null,
  })),
  requireStaffSession: vi.fn(async () => {
    throw new Error("CUSTOMER must not hit requireStaffSession");
  }),
}));

vi.mock("@/lib/store-context", () => ({
  getStoreContext: vi.fn(async () => ({ storeId: STORE_A, storeSlug: "zhubei" })),
}));

const mockResolveCustomerForUser = vi.fn();
const mockResolveCompletionStatus = vi.fn();
vi.mock("@/server/queries/customer-completion", () => ({
  resolveCustomerForUser: (...a: unknown[]) => mockResolveCustomerForUser(...a),
  resolveCustomerCompletionStatus: (...a: unknown[]) =>
    mockResolveCompletionStatus(...a),
}));

const mockMergePlaceholder = vi.fn();
const mockResolveAuthSource = vi.fn();
vi.mock("@/server/services/customer-merge", () => ({
  mergePlaceholderCustomerIntoRealCustomer: (...a: unknown[]) =>
    mockMergePlaceholder(...a),
  resolveAuthSourceFromAccounts: (...a: unknown[]) => mockResolveAuthSource(...a),
}));

vi.mock("@/server/services/referral-binding", () => ({
  bindReferralToCustomer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => ({
    get: () => null,
  })),
}));

// 排除 reminder-engine 載入（在 ensureUserExists / 其它路徑可能間接 import）
vi.mock("@/lib/normalize", async () => {
  const actual = await vi.importActual<typeof import("@/lib/normalize")>(
    "@/lib/normalize",
  );
  return actual;
});

const ADMIN_CREATED_CUSTOMER = {
  id: ADMIN_CUSTOMER_ID,
  userId: null, // admin 建立時還沒綁帳號
  storeId: STORE_A,
  phone: "0912345678",
  email: null,
  lineUserId: null,
};

beforeEach(() => {
  vi.clearAllMocks();

  // User 已存在（ensureUserExists 不會重建）— 但首次補資料時尚無 passwordHash
  mockUserFindUnique.mockResolvedValue({ id: USER_ID, passwordHash: null });
  mockUserUpdate.mockResolvedValue({ id: USER_ID });

  // Store FK 預檢通過
  mockStoreFindUnique.mockResolvedValue({ id: STORE_A });

  // 沒 LINE OAuth account
  mockAccountFindFirst.mockResolvedValue(null);

  // resolver 找不到 existing customer（OAuth 首次 / 沒有 placeholder）
  mockResolveCustomerForUser.mockResolvedValue({
    customer: null,
    reason: "not_found",
  });

  // findRealCustomerForMerge phone layer 命中 admin 建立的 customer
  // （tryLayer 用 findMany take:2，第一層 phone 即命中）
  mockCustomerFindMany.mockResolvedValue([ADMIN_CREATED_CUSTOMER]);

  // existingByUserId 查無 — OAuth 首登／顧客 user 還沒有任何 Customer
  mockCustomerFindUnique.mockResolvedValue(null);
  mockCustomerFindFirst.mockResolvedValue(null);
  mockCustomerUpdate.mockResolvedValue({ id: ADMIN_CUSTOMER_ID });

  // 合併成功
  mockMergePlaceholder.mockResolvedValue({
    realId: ADMIN_CUSTOMER_ID,
    mergedIdentity: { lineUserId: null },
    placeholderDeleted: false,
    placeholderClearedInPlace: false,
    skippedReason: null,
  });

  // 完成度驗證通過
  mockResolveCompletionStatus.mockResolvedValue({
    isComplete: true,
    missingFields: [],
    reason: "ok",
  });

  mockResolveAuthSource.mockResolvedValue("EMAIL");
});

describe("updateProfileAction — merge by storeId + phone", () => {
  it("admin 先建會員、顧客同手機補資料 → 不新增 customer，合併到原 Customer，密碼寫入 User", async () => {
    const { updateProfileAction } = await import("@/server/actions/profile");

    const fd = new FormData();
    fd.set("name", "張小明");
    fd.set("phone", "0912-345-678"); // 帶連字號驗證 normalizePhone
    fd.set("password", "secret123");
    // 其它欄位（email/birthday/gender/address）皆留空 — 改成選填後不應擋

    const result = await updateProfileAction(
      { error: null, success: false },
      fd,
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    // ── 1) 不可新增第二筆 Customer ──
    expect(mockCustomerCreate).not.toHaveBeenCalled();

    // ── 2) 合併到 admin 預先建立的那筆 ──
    expect(mockMergePlaceholder).toHaveBeenCalledTimes(1);
    const mergeCall = mockMergePlaceholder.mock.calls[0][0] as {
      placeholderCustomerId: string | null;
      realCustomerId: string;
      userId: string;
      basicProfile: { name: string; phone: string };
    };
    expect(mergeCall.realCustomerId).toBe(ADMIN_CUSTOMER_ID);
    expect(mergeCall.userId).toBe(USER_ID);
    // 沒 existing placeholder（resolver 回 not_found，且沒 existingByUserId）
    expect(mergeCall.placeholderCustomerId).toBeNull();
    // basicProfile 帶上 normalize 後的 phone（純 10 碼）
    expect(mergeCall.basicProfile.phone).toBe("0912345678");
    expect(mergeCall.basicProfile.name).toBe("張小明");

    // ── 3) 密碼寫入 User.passwordHash ──
    // verifySuccess 會呼叫 user.update 兩次：先 password、case A 路徑也會 sync name
    const passwordUpdate = mockUserUpdate.mock.calls.find(
      (call) =>
        (call[0] as { data?: { passwordHash?: string } })?.data?.passwordHash,
    );
    expect(passwordUpdate).toBeDefined();
    const hash = (passwordUpdate![0] as { data: { passwordHash: string } }).data
      .passwordHash;
    expect(hash).toMatch(/^\$2[aby]\$/); // bcryptjs hash signature
    expect(compareSync("secret123", hash)).toBe(true);
  });

  it("user 已有 passwordHash + 表單留空 → 不更新密碼（只做 Customer 合併）", async () => {
    // 已有密碼的 user
    mockUserFindUnique.mockResolvedValue({
      id: USER_ID,
      passwordHash:
        "$2b$10$abcdefghijklmnopqrstuvwxyz.zyxwvutsrqponmlkjihgfedcba1234",
    });

    const { updateProfileAction } = await import("@/server/actions/profile");

    const fd = new FormData();
    fd.set("name", "張小明");
    fd.set("phone", "0912345678");
    fd.set("password", ""); // 留空 — 不應觸發 hash 覆蓋

    const result = await updateProfileAction(
      { error: null, success: false },
      fd,
    );

    expect(result.success).toBe(true);

    // 密碼留空 → user.update 不應被呼叫覆蓋 passwordHash
    const passwordWrite = mockUserUpdate.mock.calls.find(
      (call) =>
        (call[0] as { data?: { passwordHash?: string } })?.data?.passwordHash,
    );
    expect(passwordWrite).toBeUndefined();
  });

  it("user 沒 passwordHash + 表單留空 → 拒絕並要求設密碼", async () => {
    // 預設 mockUserFindUnique 回 passwordHash: null（首次設定）
    const { updateProfileAction } = await import("@/server/actions/profile");

    const fd = new FormData();
    fd.set("name", "張小明");
    fd.set("phone", "0912345678");
    fd.set("password", ""); // 首次但沒填密碼

    const result = await updateProfileAction(
      { error: null, success: false },
      fd,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/密碼/);
    expect(mockMergePlaceholder).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });
});
