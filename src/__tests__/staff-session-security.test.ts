import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaffSessionStamp, type StaffSecurityState } from "@/lib/staff-session-security";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), capture: vi.fn(), compare: vi.fn() }));
vi.mock("next-auth", () => ({ default: (config: unknown) => {
  mocks.capture(config);
  return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
} }));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }));
vi.mock("next-auth/providers/google", () => ({ default: (config: unknown) => config }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUnique, findFirst: mocks.findFirst } } }));
vi.mock("bcryptjs", () => ({ compareSync: mocks.compare }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

type Token = Record<string, unknown>;
type Config = {
  providers: { id: string; authorize: (input: Record<string, string>) => Promise<Token | null> }[];
  callbacks: {
    jwt: (input: { token: Token; user?: Token; trigger?: string; session?: Token }) => Promise<Token | null>;
    session: (input: { session: { user: Token }; token: Token }) => { user: Token };
  };
};
let config: Config;
function state(overrides: Partial<StaffSecurityState> = {}) {
  return {
    id: "test-owner", name: "Test", email: "owner@example.invalid",
    role: "OWNER", status: "ACTIVE", passwordHash: "test-bcrypt-hash",
    updatedAt: new Date("2026-09-15T00:00:00Z"),
    staff: { id: "test-staff", storeId: "store-a", status: "ACTIVE", store: { slug: "store-a" } },
    ...overrides,
  };
}
function token(current = state()): Token {
  return { sub: current.id, role: current.role, staffSessionStamp: createStaffSessionStamp(current) };
}
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", "only-a-local-test-secret-not-a-production-secret");
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(state());
  mocks.findFirst.mockResolvedValue(state());
  mocks.compare.mockReturnValue(true);
  await import("@/lib/auth");
  if (!config) config = mocks.capture.mock.calls[0][0] as Config;
});
afterEach(() => vi.unstubAllEnvs());

describe("staff session revocation through the real auth callbacks", () => {
  it("issues a stamp only after credentials verification, and accepts unchanged state", async () => {
    const provider = config.providers.find(p => p.id === "credentials")!;
    const user = await provider.authorize({ email: "owner@example.invalid", password: "test-password" });
    expect(user?.staffSessionStamp).toMatch(/^[a-f0-9]{64}$/);
    const result = await config.callbacks.jwt({ token: {}, user: user! });
    expect(result).toMatchObject({ role: "OWNER", storeId: "store-a", staffId: "test-staff", customerId: null });
    expect(await config.callbacks.jwt({ token: result! })).toEqual(result);
  });
  it("does not issue a stamp for an incorrect password", async () => {
    mocks.compare.mockReturnValue(false);
    expect(await config.providers.find(p => p.id === "credentials")!.authorize({ email: "owner@example.invalid", password: "wrong" })).toBeNull();
  });
  it.each([
    ["suspended", { status: "SUSPENDED" }],
    ["password reset", { passwordHash: "replacement-hash" }],
    ["role reduced", { role: "PARTNER" }],
    ["reactivated after suspension", { updatedAt: new Date("2026-09-15T00:01:00Z") }],
    ["staff removed", { staff: null }],
    ["staff inactive", { staff: { id: "test-staff", storeId: "store-a", status: "INACTIVE" } }],
    ["staff moved", { staff: { id: "test-staff", storeId: "store-b", status: "ACTIVE" } }],
  ] satisfies [string, Partial<StaffSecurityState>][])('rejects old token when %s', async (_name, change) => {
    const old = token();
    mocks.findUnique.mockResolvedValue(state(change));
    expect(await config.callbacks.jwt({ token: old })).toBeNull();
  });
  it("rejects a removed account", async () => {
    const old = token(); mocks.findUnique.mockResolvedValue(null);
    expect(await config.callbacks.jwt({ token: old })).toBeNull();
  });
  it("rejects legacy staff sessions, including client update attempts", async () => {
    expect(await config.callbacks.jwt({ token: { sub: "test-owner", role: "OWNER" }, trigger: "update", session: token() })).toBeNull();
  });
  it("does not refresh a revoked stamp on update", async () => {
    const old = token(); mocks.findUnique.mockResolvedValue(state({ passwordHash: "new" }));
    expect(await config.callbacks.jwt({ token: old, trigger: "update", session: token(state({ passwordHash: "new" })) })).toBeNull();
  });
  it("rejects password reset between authorize and JWT issuance", async () => {
    const user = await config.providers.find(p => p.id === "credentials")!.authorize({ email: "owner@example.invalid", password: "test-password" });
    mocks.findUnique.mockResolvedValue(state({ passwordHash: "new" }));
    expect(await config.callbacks.jwt({ token: {}, user: user! })).toBeNull();
  });
  it("checks ADMIN without requiring a Staff relation", async () => {
    const current = state({ role: "ADMIN", staff: null }); mocks.findUnique.mockResolvedValue(current);
    expect(await config.callbacks.jwt({ token: token(current) })).toMatchObject({ role: "ADMIN", storeId: null, staffId: null });
  });
  it("fails closed on DB outage instead of returning old privileges", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));
    await expect(config.callbacks.jwt({ token: token() })).rejects.toThrow("database unavailable");
  });
  it("does not expose the stamp in the public session", () => {
    const result = config.callbacks.session({ session: { user: {} }, token: token() });
    expect(result.user).not.toHaveProperty("staffSessionStamp");
    expect(result.user).not.toHaveProperty("passwordHash");
  });
  it("leaves existing customer tokens untouched without staff DB checks", async () => {
    const customer = { sub: "customer-a", role: "CUSTOMER", customerId: "c-a", storeId: "store-a" };
    expect(await config.callbacks.jwt({ token: customer })).toEqual(customer);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("does not elevate a customer session through client update", async () => {
    mocks.findUnique.mockResolvedValue(state({ role: "ADMIN" }));
    expect(await config.callbacks.jwt({ token: { sub: "customer-a", role: "CUSTOMER" }, trigger: "update" })).toBeNull();
  });
});
