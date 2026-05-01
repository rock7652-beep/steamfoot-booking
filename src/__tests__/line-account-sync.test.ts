/**
 * syncLineAccountForUser — unit tests
 *
 * 守則覆蓋（對應 hotfix 設計文件 §C 回歸測試清單）：
 *   1. Account 不存在 → create（webhook 綁定成功 + Customer.userId 有 → 補建 Account 的核心）
 *   2. Account 存在且 userId 相同 → noop（重複綁定 / 重新登入 idempotent）
 *   3. Account 存在但 userId 不同 → 不覆蓋（防 LINE 帳號劫持）
 *   4. 缺 userId 或 lineUserId → 拒絕（webhook 綁定碼成功 + Customer.userId null → 不補 Account 的核心）
 *   5. prisma error → swallowed，回 error status（不阻擋 caller 的主流程）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAccountFindUnique = vi.fn();
const mockAccountCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    account: {
      findUnique: (...a: unknown[]) => mockAccountFindUnique(...a),
      create: (...a: unknown[]) => mockAccountCreate(...a),
    },
  },
}));

import { syncLineAccountForUser } from "@/server/services/line-account-sync";

const USER_ID = "ck0000000000000000000010";
const OTHER_USER_ID = "ck0000000000000000000011";
const LINE_USER_ID = "U_line_test_0001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncLineAccountForUser", () => {
  it("Account 不存在 → 建立新 Account（status=created）", async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    mockAccountCreate.mockResolvedValue({ id: "acct_new" });

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
    });

    expect(result).toEqual({ status: "created" });
    expect(mockAccountCreate).toHaveBeenCalledTimes(1);
    expect(mockAccountCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        provider: "line",
        providerAccountId: LINE_USER_ID,
        type: "oauth",
      },
    });
  });

  it("Account 存在且 userId 相同 → no-op（status=noop_already_synced）", async () => {
    mockAccountFindUnique.mockResolvedValue({ id: "acct_existing", userId: USER_ID });

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
    });

    expect(result).toEqual({ status: "noop_already_synced" });
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  it("Account 存在但 userId 不同 → 不覆蓋（status=skipped_already_linked_other_user）", async () => {
    mockAccountFindUnique.mockResolvedValue({ id: "acct_other", userId: OTHER_USER_ID });

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
    });

    expect(result).toEqual({
      status: "skipped_already_linked_other_user",
      existingUserId: OTHER_USER_ID,
    });
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  it("缺 userId → 拒絕（status=error，missing_input）", async () => {
    const result = await syncLineAccountForUser({
      userId: "",
      lineUserId: LINE_USER_ID,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toBe("missing_input");
    }
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  it("缺 lineUserId → 拒絕（status=error，missing_input）", async () => {
    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: "",
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toBe("missing_input");
    }
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });

  it("prisma findUnique throw → swallowed 回 error，不阻擋主流程", async () => {
    mockAccountFindUnique.mockRejectedValue(new Error("DB unreachable"));

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toMatch(/DB unreachable/);
    }
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  it("prisma create throw（例：unique 違反）→ swallowed 回 error", async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    mockAccountCreate.mockRejectedValue(
      Object.assign(new Error("unique violation"), { code: "P2002" }),
    );

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toMatch(/unique violation/);
    }
  });

  it("傳入 tx client → 用 tx 而非 prisma", async () => {
    const txAccountFindUnique = vi.fn().mockResolvedValue(null);
    const txAccountCreate = vi.fn().mockResolvedValue({ id: "tx_acct" });
    const fakeTx = {
      account: {
        findUnique: txAccountFindUnique,
        create: txAccountCreate,
      },
    } as unknown as Parameters<typeof syncLineAccountForUser>[0]["tx"];

    const result = await syncLineAccountForUser({
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      tx: fakeTx,
    });

    expect(result.status).toBe("created");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // 全域 prisma mock 不應被呼叫
    expect(mockAccountCreate).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });
});
