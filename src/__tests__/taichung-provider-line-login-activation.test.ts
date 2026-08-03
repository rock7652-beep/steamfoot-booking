import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindFirst = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockTemp = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args) },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: (...args: unknown[]) => mockTemp(...args),
}));
vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) => mockResolve(...args),
}));

describe("Taichung legacy account activation gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockTemp.mockResolvedValue({ storeId: "store-taichung", channelKey: "taichung" });
    mockCustomerFindFirst.mockResolvedValue({ id: "legacy-customer" });
    mockResolve.mockResolvedValue({
      status: "resolved",
      user: { id: "central-user", role: "CUSTOMER", status: "ACTIVE" },
    });
  });

  it("does not send a Customer without passwordHash to the password prompt", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordHash: null });
    const { resolveTaichungProviderLineLogin } = await import("@/server/actions/taichung-provider-line-login");

    await expect(resolveTaichungProviderLineLogin({ phone: "0912345678" })).resolves.toEqual({
      status: "ACCOUNT_ACTIVATION_REQUIRED",
      customerId: "legacy-customer",
    });
  });

  it("keeps the password gate only for an active resolved customer with a password", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordHash: "$2a$valid" });
    const { resolveTaichungProviderLineLogin } = await import("@/server/actions/taichung-provider-line-login");

    await expect(resolveTaichungProviderLineLogin({ phone: "0912345678" })).resolves.toMatchObject({
      status: "NEED_LOGIN",
      customerId: "legacy-customer",
    });
  });
});
