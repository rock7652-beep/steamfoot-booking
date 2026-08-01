import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNextAuth = vi.fn();
const mockCredentials = vi.fn((config: Record<string, unknown>) => config);
const mockGoogle = vi.fn((config: Record<string, unknown>) => ({
  ...config,
  id: "google",
}));
const mockVerifyLiffIdToken = vi.fn();
const mockResolveStoreBySlug = vi.fn();
const mockResolveStoreFromOAuthCookie = vi.fn();
const mockIdentityLinkFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockSyncVerifiedCentralIdentity = vi.fn();
const mockResolveCentralMemberCustomerForStore = vi.fn();
const mockResolveCentralUserForStoreCustomer = vi.fn();
const mockCompareSync = vi.fn();
const mockVerifyTaichungLineSession = vi.fn();
const mockLineOAuthAttemptUpdateMany = vi.fn();
const mockRepairCustomerIdentityOnLogin = vi.fn();

vi.mock("next-auth", () => ({
  default: (config: Record<string, unknown>) => {
    mockNextAuth(config);
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: Record<string, unknown>) => mockCredentials(config),
}));

vi.mock("next-auth/providers/google", () => ({
  default: (config: Record<string, unknown>) => mockGoogle(config),
}));

vi.mock("bcryptjs", () => ({
  compareSync: (...args: unknown[]) => mockCompareSync(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customerIdentityLink: {
      findUnique: (...args: unknown[]) => mockIdentityLinkFindUnique(...args),
    },
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
      findUnique: vi.fn(),
    },
    lineOAuthAttempt: {
      updateMany: (...args: unknown[]) => mockLineOAuthAttemptUpdateMany(...args),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/liff/verify-id-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/liff/verify-id-token")>(
    "@/lib/liff/verify-id-token",
  );
  return {
    ...actual,
    verifyLiffIdToken: (...args: unknown[]) => mockVerifyLiffIdToken(...args),
  };
});

vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: (...args: unknown[]) => mockResolveStoreBySlug(...args),
  resolveStoreFromOAuthCookie: (...args: unknown[]) =>
    mockResolveStoreFromOAuthCookie(...args),
}));

vi.mock("@/lib/identity-repair", () => ({
  repairCustomerIdentityOnLogin: (...args: unknown[]) =>
    mockRepairCustomerIdentityOnLogin(...args),
}));

vi.mock("@/server/services/sync-verified-central-identity", () => ({
  syncVerifiedCentralIdentity: (...args: unknown[]) =>
    mockSyncVerifiedCentralIdentity(...args),
}));

vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: (...args: unknown[]) =>
    mockResolveCentralMemberCustomerForStore(...args),
}));

vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) =>
    mockResolveCentralUserForStoreCustomer(...args),
}));

vi.mock("@/lib/line-oauth/taichung-session", () => ({
  TAICHUNG_LINE_SESSION_COOKIE: "taichung_line_session",
  verifyTaichungLineSession: (...args: unknown[]) =>
    mockVerifyTaichungLineSession(...args),
}));

vi.mock("@/lib/line-bind-log", async () => {
  const actual = await vi.importActual<typeof import("@/lib/line-bind-log")>(
    "@/lib/line-bind-log",
  );
  return {
    ...actual,
    logLineBindEvent: vi.fn(),
  };
});

type CredentialsProviderConfig = {
  id: string;
  authorize?: (credentials: Record<string, unknown>, request?: Request) => Promise<unknown>;
};

async function getLiffAuthorize() {
  vi.resetModules();
  await import("@/lib/auth");
  const config = mockNextAuth.mock.calls.at(-1)?.[0] as
    | { providers?: CredentialsProviderConfig[] }
    | undefined;
  const provider = config?.providers?.find((p) => p.id === "liff-token");
  if (!provider?.authorize) throw new Error("liff-token authorize not captured");
  return provider.authorize;
}

async function getCredentialsAuthorize(providerId: string) {
  vi.resetModules();
  await import("@/lib/auth");
  const config = mockNextAuth.mock.calls.at(-1)?.[0] as
    | { providers?: CredentialsProviderConfig[] }
    | undefined;
  const provider = config?.providers?.find((p) => p.id === providerId);
  if (!provider?.authorize) throw new Error(`${providerId} authorize not captured`);
  return provider.authorize;
}

async function getJwtCallback() {
  vi.resetModules();
  await import("@/lib/auth");
  const config = mockNextAuth.mock.calls.at(-1)?.[0] as
    | {
        callbacks?: {
          jwt?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
      }
    | undefined;
  if (!config?.callbacks?.jwt) throw new Error("jwt callback not captured");
  return config.callbacks.jwt;
}

const LINE_USER_ID = "U_same_line_user";
const STORE = { id: "store-hsinchu", slug: "hsinchu" };

beforeEach(() => {
  mockNextAuth.mockReset();
  mockCredentials.mockReset();
  mockCredentials.mockImplementation((config: Record<string, unknown>) => config);
  mockGoogle.mockReset();
  mockGoogle.mockImplementation((config: Record<string, unknown>) => ({
    ...config,
    id: "google",
  }));
  mockVerifyLiffIdToken.mockReset();
  mockResolveStoreBySlug.mockReset();
  mockResolveStoreFromOAuthCookie.mockReset();
  mockIdentityLinkFindUnique.mockReset();
  mockCustomerFindFirst.mockReset();
  mockSyncVerifiedCentralIdentity.mockReset();
  mockResolveCentralMemberCustomerForStore.mockReset();
  mockResolveCentralUserForStoreCustomer.mockReset();
  mockVerifyTaichungLineSession.mockReset();
  mockLineOAuthAttemptUpdateMany.mockReset();
  mockRepairCustomerIdentityOnLogin.mockReset();
  mockCompareSync.mockReset();
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "channel-123");
  mockVerifyLiffIdToken.mockResolvedValue({
    lineUserId: LINE_USER_ID,
    displayName: "LINE User",
  });
  mockResolveStoreBySlug.mockResolvedValue(STORE);
  mockResolveStoreFromOAuthCookie.mockResolvedValue({
    storeId: STORE.id,
    storeSlug: STORE.slug,
  });
  mockIdentityLinkFindUnique.mockResolvedValue(null);
  mockCustomerFindFirst.mockResolvedValue(null);
  mockSyncVerifiedCentralIdentity.mockResolvedValue({ status: "linked" });
  mockResolveCentralMemberCustomerForStore.mockResolvedValue(null);
  mockResolveCentralUserForStoreCustomer.mockResolvedValue({ status: "not_found" });
  mockVerifyTaichungLineSession.mockReturnValue(null);
  mockLineOAuthAttemptUpdateMany.mockResolvedValue({ count: 1 });
  mockCompareSync.mockReturnValue(true);
});

describe("auth.ts OAuth pending store onboarding", () => {
  it("keeps the verified Hsinchu store and clears a legacy customer from another store", async () => {
    const jwt = await getJwtCallback();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      role: "CUSTOMER",
      staff: null,
      customer: {
        id: "customer-zhubei",
        storeId: "store-zhubei",
        store: { slug: "zhubei" },
      },
    } as never);
    mockIdentityLinkFindUnique.mockResolvedValueOnce(null);

    const token = await jwt({
      token: {},
      user: { id: "user-central" },
      account: {
        type: "oauth",
        provider: "line",
        providerAccountId: LINE_USER_ID,
      },
    });

    expect(token).toMatchObject({
      customerId: null,
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });
  });

  it("refreshes the JWT to the newly registered current-store membership", async () => {
    const jwt = await getJwtCallback();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      role: "CUSTOMER",
      staff: null,
      customer: {
        id: "customer-zhubei",
        storeId: "store-zhubei",
        store: { slug: "zhubei" },
      },
    } as never);
    mockResolveCentralMemberCustomerForStore.mockResolvedValueOnce({
      customerId: "customer-hsinchu",
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });

    const token = await jwt({
      token: {
        sub: "user-central",
        role: "CUSTOMER",
        customerId: null,
        storeId: STORE.id,
        storeSlug: STORE.slug,
      },
      trigger: "update",
    });

    expect(mockResolveCentralMemberCustomerForStore).toHaveBeenCalledWith(
      "user-central",
      STORE.id,
    );
    expect(token).toMatchObject({
      customerId: "customer-hsinchu",
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });
  });
});

describe("auth.ts customer-phone provider", () => {
  it("uses the resolved direct central User and keeps the current store customer context", async () => {
    const authorize = await getCredentialsAuthorize("customer-phone");
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "resolved",
      source: "customer_user",
      customer: {
        id: "customer-phone",
        storeId: STORE.id,
        store: { slug: STORE.slug },
        hasDirectUser: true,
      },
      user: {
        id: "user-phone",
        name: "Phone User",
        email: null,
        passwordHash: "hash",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    await expect(authorize({
      phone: "+886 912-345-678",
      password: "verified-password",
      storeId: STORE.id,
    })).resolves.toMatchObject({
      id: "user-phone",
      customerId: "customer-phone",
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });

    expect(mockResolveCentralUserForStoreCustomer).toHaveBeenCalledWith({
      phone: "0912345678",
      storeId: STORE.id,
    });

    expect(mockSyncVerifiedCentralIdentity).toHaveBeenCalledWith({
      entryPoint: "phone_password",
      userId: "user-phone",
      storeId: STORE.id,
      customerId: "customer-phone",
      provider: "phone",
      providerAccountId: "0912345678",
      verifiedPhoneMatches: true,
    });
  });

  it("accepts an identity-link-only Customer without running legacy repair", async () => {
    const authorize = await getCredentialsAuthorize("customer-phone");
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "resolved",
      source: "identity_link",
      customer: {
        id: "customer-phone",
        storeId: STORE.id,
        store: { slug: STORE.slug },
        hasDirectUser: false,
      },
      user: {
        id: "user-phone",
        name: "Phone User",
        email: null,
        passwordHash: "hash",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });
    await expect(authorize({
      phone: "0912345678",
      password: "verified-password",
      storeId: STORE.id,
    })).resolves.toMatchObject({ id: "user-phone", customerId: "customer-phone" });

    expect(mockRepairCustomerIdentityOnLogin).not.toHaveBeenCalled();
  });

  it("fails closed when resolver reports conflicting identities", async () => {
    const authorize = await getCredentialsAuthorize("customer-phone");
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "identity_conflict",
    });

    await expect(authorize({
      phone: "0912345678",
      password: "verified-password",
      storeId: STORE.id,
    })).resolves.toBeNull();
    expect(mockCompareSync).not.toHaveBeenCalled();
  });
});

describe("auth.ts line-taichung-coordinator provider", () => {
  it("creates a fresh Taichung customer session from a valid one-time bridge", async () => {
    const authorize = await getCredentialsAuthorize("line-taichung-coordinator");
    mockVerifyTaichungLineSession.mockReturnValue({
      attemptId: "attempt-1",
      customerId: "customer-taichung",
      storeId: "store-taichung",
      userId: "central-user",
    });
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "resolved",
      source: "identity_link",
      customer: {
        id: "customer-taichung",
        storeId: "store-taichung",
        store: { slug: "taichung" },
        hasDirectUser: false,
      },
      user: {
        id: "central-user",
        name: "Taichung User",
        email: null,
        passwordHash: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    await expect(authorize({}, new Request("https://example.test", {
      headers: { cookie: "taichung_line_session=bridge" },
    }))).resolves.toMatchObject({
      id: "central-user",
      customerId: "customer-taichung",
      storeId: "store-taichung",
      storeSlug: "taichung",
    });
    expect(mockLineOAuthAttemptUpdateMany).toHaveBeenCalledOnce();
  });

  it("fails closed when the resolved central User does not own the coordinator bridge", async () => {
    const authorize = await getCredentialsAuthorize("line-taichung-coordinator");
    mockVerifyTaichungLineSession.mockReturnValue({
      attemptId: "attempt-1",
      customerId: "customer-hsinchu",
      storeId: STORE.id,
      userId: "bridge-user",
    });
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "resolved",
      source: "identity_link",
      customer: {
        id: "customer-hsinchu",
        storeId: STORE.id,
        store: { slug: STORE.slug },
        hasDirectUser: false,
      },
      user: {
        id: "different-central-user",
        name: "Wrong owner",
        email: null,
        passwordHash: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    await expect(authorize({}, new Request("https://example.test", {
      headers: { cookie: "taichung_line_session=bridge" },
    }))).resolves.toBeNull();

    expect(mockResolveCentralUserForStoreCustomer).toHaveBeenCalledWith({
      customerId: "customer-hsinchu",
      storeId: STORE.id,
    });
  });

  it("rejects an inactive bridge owner", async () => {
    const authorize = await getCredentialsAuthorize("line-taichung-coordinator");
    mockVerifyTaichungLineSession.mockReturnValue({
      attemptId: "attempt-1",
      customerId: "customer-taichung",
      storeId: "store-taichung",
      userId: "central-user",
    });
    mockResolveCentralUserForStoreCustomer.mockResolvedValueOnce({
      status: "resolved",
      source: "identity_link",
      customer: {
        id: "customer-taichung",
        storeId: "store-taichung",
        store: { slug: "taichung" },
        hasDirectUser: false,
      },
      user: {
        id: "central-user",
        name: "Inactive User",
        email: null,
        passwordHash: null,
        role: "CUSTOMER",
        status: "INACTIVE",
      },
    });

    await expect(authorize({}, new Request("https://example.test", {
      headers: { cookie: "taichung_line_session=bridge" },
    }))).resolves.toBeNull();
  });
});

describe("auth.ts liff-token provider", () => {
  it("uses CustomerIdentityLink first and returns that store's customer, ignoring legacy Customer.userId elsewhere", async () => {
    const authorize = await getLiffAuthorize();
    mockIdentityLinkFindUnique.mockResolvedValueOnce({
      customer: {
        id: "cust-hsinchu",
        storeId: STORE.id,
        store: { slug: STORE.slug },
      },
      user: {
        id: "user-line",
        name: "LINE User",
        email: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-zhubei-legacy",
      storeId: "store-zhubei",
      store: { slug: "zhubei" },
      user: {
        id: "user-line",
        name: "Legacy",
        email: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    const result = await authorize({ idToken: "tok", storeSlug: STORE.slug });

    expect(result).toMatchObject({
      id: "user-line",
      customerId: "cust-hsinchu",
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });
    expect(mockIdentityLinkFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_customer_identity_provider_store: {
            provider: "line",
            providerAccountId: LINE_USER_ID,
            storeId: STORE.id,
          },
        },
      }),
    );
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to legacy Customer(storeId,lineUserId) only when no identity link exists", async () => {
    const authorize = await getLiffAuthorize();
    mockIdentityLinkFindUnique.mockResolvedValueOnce(null);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-hsinchu-legacy",
      storeId: STORE.id,
      store: { slug: STORE.slug },
      user: {
        id: "user-line",
        name: "LINE User",
        email: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    const result = await authorize({ idToken: "tok", storeSlug: STORE.slug });

    expect(result).toMatchObject({
      customerId: "cust-hsinchu-legacy",
      storeId: STORE.id,
      storeSlug: STORE.slug,
    });
    expect(mockCustomerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: STORE.id, lineUserId: LINE_USER_ID },
      }),
    );
  });
});
