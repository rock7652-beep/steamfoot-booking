import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindFirst = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockIdentityFindFirst = vi.hoisted(() => vi.fn());
const mockTemp = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args) },
    customerIdentityLink: { findFirst: (...args: unknown[]) => mockIdentityFindFirst(...args) },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));
vi.mock("@/lib/server/oauth-temp-session", () => ({
  getOAuthTempSession: (...args: unknown[]) => mockTemp(...args),
}));
vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) => mockResolve(...args),
}));
vi.mock("@/lib/line-oauth/taichung-handoff-log", () => ({
  logTaichungLineHandoff: (...args: unknown[]) => mockLog(...args),
}));

describe("Taichung legacy account activation gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockTemp.mockResolvedValue({ storeId: "store-taichung", channelKey: "taichung" });
    mockCustomerFindFirst.mockResolvedValue({ id: "legacy-customer", userId: "central-user", identityLinks: [] });
    mockIdentityFindFirst.mockResolvedValue(null);
    mockResolve.mockResolvedValue({
      status: "resolved",
      user: { id: "central-user", role: "CUSTOMER", status: "ACTIVE" },
    });
  });

  it("only offers activation to a Customer with no central user or login identities", async () => {
    mockCustomerFindFirst.mockResolvedValue({ id: "legacy-customer", userId: null, identityLinks: [] });
    const { resolveTaichungProviderLineLogin } = await import("@/server/actions/taichung-provider-line-login");
    await expect(resolveTaichungProviderLineLogin({ phone: "0912345678" })).resolves.toEqual({
      status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: "legacy-customer",
    });
  });

  it("does not send a Customer without passwordHash to the password prompt", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordHash: null });
    const { resolveTaichungProviderLineLogin } = await import("@/server/actions/taichung-provider-line-login");

    await expect(resolveTaichungProviderLineLogin({ phone: "0912345678" })).resolves.toEqual({
      status: "ACCOUNT_ACTIVATION_REQUIRED",
      customerId: "legacy-customer",
    });
    expect(mockLog).toHaveBeenCalledWith("login_gate_rejected", {
      customerId: "legacy-customer",
      storeId: "store-taichung",
      errorCode: "password_activation_required",
    });
  });

  it("records a fixed fail-closed code when the LINE Login identity belongs elsewhere", async () => {
    mockCustomerFindFirst.mockResolvedValue({ id: "legacy-customer", userId: null, identityLinks: [] });
    mockIdentityFindFirst.mockResolvedValue({ id: "other-line-login" });
    const { resolveTaichungProviderLineLogin } = await import("@/server/actions/taichung-provider-line-login");

    await expect(resolveTaichungProviderLineLogin({ phone: "0912345678" })).resolves.toEqual({
      error: "line_already_bound_other",
    });
    expect(mockLog).toHaveBeenCalledWith("login_gate_rejected", {
      customerId: "legacy-customer",
      storeId: "store-taichung",
      errorCode: "line_login_conflict",
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
