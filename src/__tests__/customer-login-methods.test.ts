import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique } },
}));

import { getCustomerLoginMethods } from "@/server/queries/customer-login-methods";

describe("getCustomerLoginMethods", () => {
  beforeEach(() => findUnique.mockReset());

  it("returns only masked identifiers for linked methods", async () => {
    findUnique.mockResolvedValue({
      phone: "0912345678",
      email: "member@example.com",
      passwordHash: "secret-hash",
      accounts: [{ provider: "google" }, { provider: "line" }],
    });

    await expect(getCustomerLoginMethods("user-1")).resolves.toEqual({
      phone: { linked: true, maskedValue: "09******78" },
      google: { linked: true, maskedValue: "m***@example.com" },
      line: { linked: true },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });

  it("does not call a contact phone a login method without a password", async () => {
    findUnique.mockResolvedValue({
      phone: "0912345678",
      email: "contact@example.com",
      passwordHash: null,
      accounts: [],
    });

    await expect(getCustomerLoginMethods("user-2")).resolves.toEqual({
      phone: { linked: false, maskedValue: "09******78" },
      google: { linked: false, maskedValue: null },
      line: { linked: false },
    });
  });

  it("fails closed when the central user no longer exists", async () => {
    findUnique.mockResolvedValue(null);

    await expect(getCustomerLoginMethods("stale-user")).resolves.toEqual({
      phone: { linked: false, maskedValue: null },
      google: { linked: false, maskedValue: null },
      line: { linked: false },
    });
  });
});
