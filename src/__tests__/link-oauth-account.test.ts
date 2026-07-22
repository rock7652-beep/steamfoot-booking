import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "next-auth";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  accountFindUnique: vi.fn(),
  accountCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        user: { findUnique: mocks.userFindUnique },
        account: {
          findUnique: mocks.accountFindUnique,
          create: mocks.accountCreate,
        },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));

import { linkVerifiedOAuthAccount } from "@/server/services/link-oauth-account";

const account: Account = {
  type: "oauth",
  provider: "google",
  providerAccountId: "google-sub-1",
};

describe("linkVerifiedOAuthAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ role: "CUSTOMER", status: "ACTIVE" });
    mocks.accountFindUnique.mockResolvedValue(null);
  });

  it("creates the verified provider account for the fixed target user", async () => {
    await expect(
      linkVerifiedOAuthAccount({
        targetUserId: "user-1",
        provider: "google",
        account,
      }),
    ).resolves.toEqual({ status: "linked" });
    expect(mocks.accountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-sub-1",
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when the same user already owns the account", async () => {
    mocks.accountFindUnique.mockResolvedValue({ userId: "user-1" });
    await expect(
      linkVerifiedOAuthAccount({
        targetUserId: "user-1",
        provider: "google",
        account,
      }),
    ).resolves.toEqual({ status: "already_linked" });
    expect(mocks.accountCreate).not.toHaveBeenCalled();
  });

  it("never moves an account owned by another central user", async () => {
    mocks.accountFindUnique.mockResolvedValue({ userId: "other-user" });
    await expect(
      linkVerifiedOAuthAccount({
        targetUserId: "user-1",
        provider: "google",
        account,
      }),
    ).resolves.toEqual({
      status: "rejected",
      reason: "owned_by_other_user",
    });
    expect(mocks.accountCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects an inactive or non-customer target", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    await expect(
      linkVerifiedOAuthAccount({
        targetUserId: "owner-1",
        provider: "line",
        account: { ...account, provider: "line" },
      }),
    ).resolves.toEqual({
      status: "rejected",
      reason: "target_unavailable",
    });
    expect(mocks.accountFindUnique).not.toHaveBeenCalled();
  });
});
