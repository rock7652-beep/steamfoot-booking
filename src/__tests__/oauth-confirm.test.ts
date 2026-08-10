/**
 * resolveLineLogin / finalizeLineBind — server action unit tests
 *
 * 為什麼需要這個檔？
 *   PR-2 流程要驗 6 個 case，但其中 5 個必須真 LINE 帳號 + 真客人，無法用客人測。
 *   這個 unit test 把 prisma + temp session + auth() 全 mock，把 12 個邏輯分支
 *   全跑一遍，達到 logic-level 95% 覆蓋。
 *
 * 沒覆蓋的部分：
 *   - 真 LINE OAuth → auth.ts 觸發 redirect /api/oauth-line-stage 那一條（Case 1
 *     在 staging 已驗）
 *   - signIn() 在 oauthConfirmLoginAction 內的行為（NextAuth 內部，不 mock）
 *   - HMAC stage token 的簽 / 驗（oauth-stage-token.ts 是純函式可獨立 test）
 *
 * 設計依據：docs/identity-flow.md §3 三狀態判定 + finalizeLineBind 5 道安全閘
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Mocks ──────────────────────────────────────────────
const mockGetOAuthTempSession = vi.fn();
const mockClearOAuthTempSession = vi.fn();
const mockAuth = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockCustomerCreate = vi.fn();
const mockAccountCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
      update: (...args: unknown[]) => mockCustomerUpdate(...args),
      create: (...args: unknown[]) => mockCustomerCreate(...args),
    },
    account: {
      count: (...args: unknown[]) => mockAccountCount(...args),
    },
  },
}));

vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: () => mockGetOAuthTempSession(),
  clearOAuthTempSession: () => mockClearOAuthTempSession(),
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  signIn: vi.fn(),
}));

// next-auth 直接 import 鏈會把 next/server 拉進 vitest 環境（解析失敗）。
// 這裡 mock 整個 next-auth 模組，給出最小介面（AuthError）。
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

vi.mock("@/lib/normalize", () => ({
  normalizePhone: (s: string) => s,
}));

// Hotfix line-account-sync wiring: 把 helper mock 起來確認被呼叫；helper 自身
// 由 src/__tests__/line-account-sync.test.ts 獨立覆蓋。
// Post-PR-G5.2.a: finalizeLineBind 不再呼叫 syncLineAccountForUser（改由 D3
// helper 在 Serializable tx 內 atomic 寫入 Account[line]）。本 mock 仍保留，
// 因為 resolveLineLogin (placeholder-Customer 路徑) 仍會呼叫它。
const mockSyncLineAccount = vi.fn();
vi.mock("@/server/services/line-account-sync", () => ({
  syncLineAccountForUser: (...args: unknown[]) => mockSyncLineAccount(...args),
}));

// PR-G5.2.a: finalizeLineBind 委派到 D3 canonical helper
// `bindLineToExistingCustomerById`。helper 自身由 PR-G5.1.a 的
// bind-line-to-existing-customer-by-id.test.ts (153 tests) 獨立覆蓋；本檔只
// 驗 finalize 正確 dispatch + 把 D3 status 映射回前端期待的 BOUND / error
// 形狀。
const mockBindLineToExistingCustomerById = vi.fn();
vi.mock("@/server/services/bind-line-to-customer", () => ({
  bindLineToExistingCustomerById: (...args: unknown[]) =>
    mockBindLineToExistingCustomerById(...args),
}));

// 必須在 mocks 之後 import（vi.mock 會 hoist，但動態 reference 才會吃到 mock）
import { resolveLineLogin, finalizeLineBind } from "@/server/actions/oauth-confirm";

// ── 共用 fixtures ────────────────────────────────────────
const STORE_ID = "store-zhubei";
const LINE_USER_ID = "U_line_test_0001";
const OTHER_LINE_USER_ID = "U_line_other_0002";
const DISPLAY_NAME = "Test User";
const VALID_PHONE = "0912345678";
const NEXT_AUTH_USER_ID = "user-cuid-001";
const CUSTOMER_ID = "customer-cuid-001";

const validTempSession = {
  lineUserId: LINE_USER_ID,
  displayName: DISPLAY_NAME,
  storeId: STORE_ID,
  nonce: "nonce-123",
  createdAt: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════
// resolveLineLogin
// ════════════════════════════════════════════════════════
describe("resolveLineLogin", () => {
  it("invalid phone format → invalid_phone", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    const r = await resolveLineLogin({ phone: "0123" }); // 不符 ^09\d{8}$
    expect(r).toEqual({ error: "invalid_phone" });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("temp session 不存在 → session_expired", async () => {
    mockGetOAuthTempSession.mockResolvedValue(null);
    const r = await resolveLineLogin({ phone: VALID_PHONE });
    expect(r).toEqual({ error: "session_expired" });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("Case 1: lineUserId 同店命中 → BOUND_EXISTING + clearTemp（不查 phone）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.storeId === STORE_ID && where.lineUserId === LINE_USER_ID) {
        return { id: CUSTOMER_ID };
      }
      return null;
    });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "BOUND_EXISTING",
      action: "RELOGIN",
      customerId: CUSTOMER_ID,
    });
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    // Step 0 命中後**不應**進到 phone 查詢
    expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
  });

  it("Case 2: phone 命中 + 已啟用（hasPasswordHash）→ NEED_LOGIN（不動 DB / 不 clear temp）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 lineUserId miss
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: NEXT_AUTH_USER_ID,
        lineUserId: null,
        totalPoints: 0,
        user: { passwordHash: "$2a$bcrypt-hash" },
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "NEED_LOGIN",
      phone: VALID_PHONE,
      maskedPhone: `*******${VALID_PHONE.slice(-3)}`,
      customerId: CUSTOMER_ID,
    });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("Case 2 變體: phone 命中 + 已啟用（hasOAuthAccount）→ NEED_LOGIN", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: NEXT_AUTH_USER_ID,
        lineUserId: null,
        totalPoints: 0,
        user: { passwordHash: null }, // 無密碼
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });
    mockAccountCount.mockResolvedValue(1); // 但有 OAuth Account → 算已啟用

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "NEED_LOGIN",
      phone: VALID_PHONE,
      maskedPhone: `*******${VALID_PHONE.slice(-3)}`,
      customerId: CUSTOMER_ID,
    });
  });

  it("Case 3: phone 命中 + 未啟用 + 無資產 → BOUND_EXISTING（綁 LINE + clearTemp + authSource 升級）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: null, // 未啟用
        lineUserId: null,
        totalPoints: 0,
        user: null,
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "BOUND_EXISTING",
      action: "RELOGIN",
      customerId: CUSTOMER_ID,
    });
    expect(mockCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER_ID },
        data: expect.objectContaining({
          lineUserId: LINE_USER_ID,
          lineLinkStatus: "LINKED",
          lineName: DISPLAY_NAME,
          authSource: "LINE",
        }),
      }),
    );
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
    // userId=null → 不應呼叫 syncLineAccountForUser（沒 user 可綁 Account）
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  it("Case 3 變體: phone 命中 + 已有中央 User 但尚未設定密碼 → ACCOUNT_ACTIVATION_REQUIRED", async () => {
    // A direct central member with no password used to have LINE bound and was
    // then sent to password login, where no password could succeed.
    mockGetOAuthTempSession.mockResolvedValue({ ...validTempSession, channelKey: "taichung" });
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: NEXT_AUTH_USER_ID, // 已啟用 user
        lineUserId: null,
        totalPoints: 0,
        user: { passwordHash: null }, // hasPassword=false
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });
    mockAccountCount.mockResolvedValue(1); // Even an existing OAuth account is not a password.

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "ACCOUNT_ACTIVATION_REQUIRED",
      customerId: CUSTOMER_ID,
    });
    expect(mockAccountCount).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("Case 4: phone 命中 + 未啟用 + 有 wallet → BLOCKED_NEEDS_STAFF（不寫 DB）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: null,
        lineUserId: null,
        totalPoints: 0,
        user: null,
        _count: { planWallets: 1, bookings: 0, transactions: 0 }, // 有方案
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "BLOCKED_NEEDS_STAFF",
      customerId: CUSTOMER_ID,
    });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("Case 4 變體: 未啟用 + 有 booking → BLOCKED_NEEDS_STAFF", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: null,
        lineUserId: null,
        totalPoints: 0,
        user: null,
        _count: { planWallets: 0, bookings: 1, transactions: 0 },
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });
    expect(r).toEqual({ status: "BLOCKED_NEEDS_STAFF", customerId: CUSTOMER_ID });
  });

  it("Case 4 變體: 未啟用 + 有 totalPoints → BLOCKED_NEEDS_STAFF", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: null,
        lineUserId: null,
        totalPoints: 100, // 有點數
        user: null,
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });
    expect(r).toEqual({ status: "BLOCKED_NEEDS_STAFF", customerId: CUSTOMER_ID });
  });

  it("Case 5: phone 不存在 → NEW_USER（建 Customer with LINE+phone）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss
      .mockResolvedValueOnce(null); // phone miss
    mockCustomerCreate.mockResolvedValue({ id: CUSTOMER_ID });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "NEW_USER",
      action: "RELOGIN",
      customerId: CUSTOMER_ID,
    });
    expect(mockCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: DISPLAY_NAME,
          phone: VALID_PHONE,
          storeId: STORE_ID,
          authSource: "LINE",
          lineUserId: LINE_USER_ID,
          lineLinkStatus: "LINKED",
          lineName: DISPLAY_NAME,
          customerStage: "LEAD",
        }),
      }),
    );
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
  });

  it("Case 6: phone 命中 Customer 已綁不同 lineUserId → line_already_bound_other（不動 DB）", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce(null) // Step 0 miss（只查同 lineUserId）
      .mockResolvedValueOnce({
        id: CUSTOMER_ID,
        userId: NEXT_AUTH_USER_ID,
        lineUserId: OTHER_LINE_USER_ID, // 已綁別人
        totalPoints: 0,
        user: { passwordHash: "$2a$..." },
        _count: { planWallets: 0, bookings: 0, transactions: 0 },
      });

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({ error: "line_already_bound_other" });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("競態 P2002（雙 tab create 同 phone）→ 遞迴重查命中 BOUND_EXISTING", async () => {
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    // 第一次：Step 0 miss、phone miss、create 拋 P2002
    // 遞迴第二次：Step 0 命中（剛被 race 那邊建出來）
    let callCount = 0;
    mockCustomerFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      callCount++;
      // 第一輪 Step 0 / phone 都 miss
      if (callCount <= 2) return null;
      // 第二輪 Step 0 命中
      if (where.storeId === STORE_ID && where.lineUserId === LINE_USER_ID) {
        return { id: CUSTOMER_ID };
      }
      return null;
    });
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test", meta: { target: ["storeId", "phone"] } },
    );
    mockCustomerCreate.mockRejectedValueOnce(p2002);

    const r = await resolveLineLogin({ phone: VALID_PHONE });

    expect(r).toEqual({
      status: "BOUND_EXISTING",
      action: "RELOGIN",
      customerId: CUSTOMER_ID,
    });
    expect(mockCustomerCreate).toHaveBeenCalledOnce(); // 第二輪不再 create
  });
});

// ════════════════════════════════════════════════════════
// finalizeLineBind
// ════════════════════════════════════════════════════════
describe("finalizeLineBind", () => {
  const FINALIZE_INPUT = { customerId: CUSTOMER_ID, callbackUrl: "/" };

  it("無 NextAuth session → auth_required", async () => {
    mockAuth.mockResolvedValue(null);
    const r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "auth_required" });
    expect(mockGetOAuthTempSession).not.toHaveBeenCalled();
  });

  it("無 OAuth temp session → session_expired", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(null);

    const r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "session_expired" });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("customerId 不屬於當前 user → customer_mismatch（防 URL 篡改）", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    // findFirst with id+storeId+userId 都符合的 query 找不到
    mockCustomerFindFirst.mockResolvedValue(null);

    const r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "customer_mismatch" });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("Customer 已有不同的 lineUserId → line_already_bound_other（防覆蓋）", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      lineUserId: OTHER_LINE_USER_ID, // 已綁別的
    });

    const r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "line_already_bound_other" });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("同 store 已有別的 Customer 綁同 lineUserId → line_already_bound_other（防身份轉移）", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null }) // 自己沒綁
      .mockResolvedValueOnce({ id: "other-customer-cuid" }); // 但別人綁了相同 lineUserId

    const r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "line_already_bound_other" });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a happy path (bound_existing)：委派 D3 helper，atomic 寫入 + clearTemp + return RELOGIN signal", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null); // 同 store 沒人撞同 lineUserId
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({
      status: "BOUND",
      action: "RELOGIN",
      callbackUrl: "/profile",
    });
    // D3 helper 被呼叫帶正確 storeId / customerId / lineUserId / lineName
    expect(mockBindLineToExistingCustomerById).toHaveBeenCalledOnce();
    expect(mockBindLineToExistingCustomerById).toHaveBeenCalledWith({
      storeId: STORE_ID,
      customerId: CUSTOMER_ID,
      lineUserId: LINE_USER_ID,
      lineName: DISPLAY_NAME,
    });
    // finalize 不再直接呼叫 customer.update（D3 內部用 updateMany CAS）
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
    // finalize 不再呼叫 syncLineAccount（D3 在同一 tx 內 atomic 寫 Account[line]）
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
    // 成功路徑必清 temp session（防 nonce reuse）
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
  });

  it("PR-G5.2.a (already_synced)：idempotent 重綁 / Account-only repair 也是 BOUND", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    // 已綁同個 lineUserId — guard 4 不擋（檢查 !== input.lineUserId）
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: LINE_USER_ID })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({
      status: "BOUND",
      action: "RELOGIN",
      callbackUrl: "/profile",
    });
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (customer_locked → line_already_bound_other)：D3 偵測衝突映射為前端原有錯誤", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null); // guard 4 過
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "customer_locked",
      customerId: CUSTOMER_ID,
      existingLineUserId: OTHER_LINE_USER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "line_already_bound_other" });
    // 失敗路徑不清 temp session（讓 user 可重試）
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (unique_conflict → bind_conflict)：D3 P2002 競態具名化", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "unique_conflict",
      conflictTarget: "Account_provider_providerAccountId_key",
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "bind_conflict" });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a Codex P2 round 1 (customer_repaired → BOUND): D3 偵測 Account-first drift (Account 已存在 same-user, Customer.lineUserId null) → 修 Customer-only, finalize 仍回 BOUND", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    // Guard 3-4 過：customer 自己 lineUserId null，沒人撞同 lineUserId
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    // D3 命中 step 5.6-a → runCustomerOnlyRepairTx → customer_repaired
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "customer_repaired",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    // 成功路徑：finalize 回原本前端期待的 BOUND / RELOGIN / callbackUrl。
    // 此 drift 在 PR-G5.2.a 接 D3 後若無 customer_repaired 分支會撞 P2002
    // → unique_conflict → bind_conflict → 卡死無法修復。本測試 sentinel
    // 確保 Codex P2 round 1 修補後此 drift 能被前端 finalize 自動清掉。
    expect(r).toEqual({
      status: "BOUND",
      action: "RELOGIN",
      callbackUrl: "/profile",
    });
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (account_repaired → BOUND)：D3 補建缺失 Account 也是成功路徑", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    // Customer 已正確 lineUserId（pre-G5.x 殘屑：Customer 鏈接過但 Account
    // 缺失）— guard 4 不擋（已綁同個）
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: LINE_USER_ID })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "account_repaired",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({
      status: "BOUND",
      action: "RELOGIN",
      callbackUrl: "/profile",
    });
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (stale_customer_link → write_conflict)：D3 TOCTOU 與 P2034 同類，告知 caller 可重試", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "write_conflict" });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (write_conflict → write_conflict)：D3 P2034 Serializable 競態可重試", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "write_conflict",
      code: "P2034",
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "write_conflict" });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (store_mismatch → customer_mismatch)：D3 防禦性 store re-check 失敗映射既有錯誤", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "store_mismatch",
      expectedStoreId: STORE_ID,
      actualStoreId: "store-other",
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "customer_mismatch" });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a (customer_has_no_user → customer_mismatch)：D3 防禦性 userId null 映射既有錯誤", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "customer_has_no_user",
      customerId: CUSTOMER_ID,
    });

    const r = await finalizeLineBind({
      customerId: CUSTOMER_ID,
      callbackUrl: "/profile",
    });

    expect(r).toEqual({ error: "customer_mismatch" });
    expect(mockClearOAuthTempSession).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a regression sentinel: finalize 不再直接呼叫 prisma.customer.update（D3 包辦）", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    await finalizeLineBind({ customerId: CUSTOMER_ID, callbackUrl: "/" });

    // finalize 本身不可動 prisma.customer.update — 寫入屬於 D3 內部 updateMany CAS
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a regression sentinel: finalize 不再呼叫 syncLineAccountForUser（D3 同 tx 內處理 Account）", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null);
    mockBindLineToExistingCustomerById.mockResolvedValueOnce({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: NEXT_AUTH_USER_ID,
    });

    await finalizeLineBind({ customerId: CUSTOMER_ID, callbackUrl: "/" });

    // syncLineAccountForUser 是 PR-G5.2.a 前的 post-tx best-effort，現已由 D3
    // 在 Serializable tx 內取代。本 sentinel 防回退。
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  it("PR-G5.2.a guard 1-4 不退化: guard fail 時不會呼叫 D3 helper（0 寫入）", async () => {
    // Guard 1: no NextAuth session
    mockAuth.mockResolvedValueOnce(null);
    let r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "auth_required" });
    expect(mockBindLineToExistingCustomerById).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Guard 2: no temp session
    mockAuth.mockResolvedValueOnce({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValueOnce(null);
    r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "session_expired" });
    expect(mockBindLineToExistingCustomerById).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Guard 3: customer mismatch
    mockAuth.mockResolvedValueOnce({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValueOnce(validTempSession);
    mockCustomerFindFirst.mockResolvedValueOnce(null);
    r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "customer_mismatch" });
    expect(mockBindLineToExistingCustomerById).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Guard 4a: customer 已綁不同 LINE
    mockAuth.mockResolvedValueOnce({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValueOnce(validTempSession);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      lineUserId: OTHER_LINE_USER_ID,
    });
    r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "line_already_bound_other" });
    expect(mockBindLineToExistingCustomerById).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // Guard 4b: 同 store 別人綁了相同 lineUserId
    mockAuth.mockResolvedValueOnce({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValueOnce(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce({ id: "other-customer-cuid" });
    r = await finalizeLineBind(FINALIZE_INPUT);
    expect(r).toEqual({ error: "line_already_bound_other" });
    expect(mockBindLineToExistingCustomerById).not.toHaveBeenCalled();
  });
});
