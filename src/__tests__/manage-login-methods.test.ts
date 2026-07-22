import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  accountDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
        account: { deleteMany: mocks.accountDeleteMany },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));

import { unlinkCustomerLoginMethod } from "@/server/services/manage-login-methods";

describe("unlinkCustomerLoginMethod", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to remove the final usable login method", async () => {
    mocks.userFindUnique.mockResolvedValue({
      role: "CUSTOMER",
      status: "ACTIVE",
      phone: "0912345678",
      passwordHash: "hash",
      accounts: [],
    });
    await expect(
      unlinkCustomerLoginMethod({ userId: "user-1", method: "phone" }),
    ).resolves.toBe("last_method");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("unlinks OAuth when another usable method remains", async () => {
    mocks.userFindUnique.mockResolvedValue({
      role: "CUSTOMER",
      status: "ACTIVE",
      phone: "0912345678",
      passwordHash: "hash",
      accounts: [{ provider: "line" }],
    });
    await expect(
      unlinkCustomerLoginMethod({ userId: "user-1", method: "line" }),
    ).resolves.toBe("unlinked");
    expect(mocks.accountDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "line" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("removes the phone credential without deleting the contact number", async () => {
    mocks.userFindUnique.mockResolvedValue({
      role: "CUSTOMER",
      status: "ACTIVE",
      phone: "0912345678",
      passwordHash: "hash",
      accounts: [{ provider: "google" }],
    });
    await expect(
      unlinkCustomerLoginMethod({ userId: "user-1", method: "phone" }),
    ).resolves.toBe("unlinked");
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: null },
    });
  });
});
