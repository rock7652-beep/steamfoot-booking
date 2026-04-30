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

  it("happy path：寫入 lineUserId + clearTemp + return RELOGIN signal", async () => {
    mockAuth.mockResolvedValue({ user: { id: NEXT_AUTH_USER_ID } });
    mockGetOAuthTempSession.mockResolvedValue(validTempSession);
    mockCustomerFindFirst
      .mockResolvedValueOnce({ id: CUSTOMER_ID, lineUserId: null })
      .mockResolvedValueOnce(null); // 同 store 沒人撞同 lineUserId
    mockCustomerUpdate.mockResolvedValue({});

    const r = await finalizeLineBind({ customerId: CUSTOMER_ID, callbackUrl: "/profile" });

    expect(r).toEqual({
      status: "BOUND",
      action: "RELOGIN",
      callbackUrl: "/profile",
    });
    expect(mockCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CUSTOMER_ID },
        data: expect.objectContaining({
          lineUserId: LINE_USER_ID,
          lineLinkStatus: "LINKED",
          lineName: DISPLAY_NAME,
        }),
      }),
    );
    expect(mockClearOAuthTempSession).toHaveBeenCalledOnce();
  });
});
