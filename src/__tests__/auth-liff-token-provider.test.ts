import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNextAuth = vi.fn();
const mockCredentials = vi.fn((config: Record<string, unknown>) => config);
const mockGoogle = vi.fn((config: Record<string, unknown>) => ({
  ...config,
  id: "google",
}));
const mockVerifyLiffIdToken = vi.fn();
const mockResolveStoreBySlug = vi.fn();
const mockIdentityLinkFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockSyncVerifiedCentralIdentity = vi.fn();
const mockCompareSync = vi.fn();

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
  resolveStoreFromOAuthCookie: vi.fn(),
}));

vi.mock("@/lib/identity-repair", () => ({
  repairCustomerIdentityOnLogin: vi.fn(),
}));

vi.mock("@/server/services/sync-verified-central-identity", () => ({
  syncVerifiedCentralIdentity: (...args: unknown[]) =>
    mockSyncVerifiedCentralIdentity(...args),
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
  authorize?: (credentials: Record<string, unknown>) => Promise<unknown>;
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
  mockIdentityLinkFindUnique.mockReset();
  mockCustomerFindFirst.mockReset();
  mockSyncVerifiedCentralIdentity.mockReset();
  mockCompareSync.mockReset();
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "channel-123");
  mockVerifyLiffIdToken.mockResolvedValue({
    lineUserId: LINE_USER_ID,
    displayName: "LINE User",
  });
  mockResolveStoreBySlug.mockResolvedValue(STORE);
  mockIdentityLinkFindUnique.mockResolvedValue(null);
  mockCustomerFindFirst.mockResolvedValue(null);
  mockSyncVerifiedCentralIdentity.mockResolvedValue({ status: "linked" });
  mockCompareSync.mockReturnValue(true);
});

describe("auth.ts customer-phone provider", () => {
  it("creates the store-scoped phone identity only after password verification", async () => {
    const authorize = await getCredentialsAuthorize("customer-phone");
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "customer-phone",
      storeId: STORE.id,
      store: { slug: STORE.slug },
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
    })).resolves.toMatchObject({ id: "user-phone", customerId: "customer-phone" });

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

  it("fails closed when the verified phone link conflicts", async () => {
    const authorize = await getCredentialsAuthorize("customer-phone");
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "customer-phone",
      storeId: STORE.id,
      store: { slug: STORE.slug },
      user: {
        id: "user-phone",
        name: "Phone User",
        email: null,
        passwordHash: "hash",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });
    mockSyncVerifiedCentralIdentity.mockResolvedValueOnce({
      status: "manual_review",
      reason: "existing_membership_conflict",
    });

    await expect(authorize({
      phone: "0912345678",
      password: "verified-password",
      storeId: STORE.id,
    })).resolves.toBeNull();
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
