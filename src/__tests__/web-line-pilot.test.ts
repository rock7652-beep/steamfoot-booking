import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customerIdentityLink: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/store-resolver", () => ({ resolveStoreFromOAuthCookie: mocks.store }));
import { allowWebLinePilot } from "@/server/services/web-line-pilot";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("WEB_LINE_LOGIN_MODE", "pilot");
  vi.stubEnv("WEB_LINE_LOGIN_PILOT_USER_ID", "member");
  vi.stubEnv("WEB_LINE_LOGIN_PILOT_STORE_ID", "store");
  mocks.store.mockResolvedValue({ storeId: "store" });
  mocks.findUnique.mockResolvedValue({ userId: "member", user: { id: "member", role: "CUSTOMER", status: "ACTIVE" }, customer: { storeId: "store", userId: null, mergedIntoCustomerId: null } });
});
afterEach(() => vi.unstubAllEnvs());
it("allows only the verified subject's exact active membership", async () => {
  expect(await allowWebLinePilot("verified-subject")).toBe(true);
  expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { uq_customer_identity_provider_store: { provider: "line", providerAccountId: "verified-subject", storeId: "store" } } }));
});
it("denies another member", async () => {
  mocks.findUnique.mockResolvedValue({ userId: "other" });
  expect(await allowWebLinePilot("other")).toBe(false);
});
it("denies a different store before lookup", async () => {
  mocks.store.mockResolvedValue({ storeId: "other" });
  expect(await allowWebLinePilot("verified-subject")).toBe(false);
  expect(mocks.findUnique).not.toHaveBeenCalled();
});
it.each(["", "disabled", "typo"])("fails closed in production for mode %s", async mode => {
  vi.stubEnv("WEB_LINE_LOGIN_MODE", mode);
  expect(await allowWebLinePilot("verified-subject")).toBe(false);
});
it("denies incomplete pilot configuration", async () => {
  vi.stubEnv("WEB_LINE_LOGIN_PILOT_USER_ID", "");
  expect(await allowWebLinePilot("verified-subject")).toBe(false);
});
it("denies unlinked identities", async () => {
  mocks.findUnique.mockResolvedValue(null);
  expect(await allowWebLinePilot("unknown")).toBe(false);
});
it("keeps preview default available without production records", async () => {
  vi.stubEnv("WEB_LINE_LOGIN_MODE", ""); vi.stubEnv("VERCEL_ENV", "preview");
  expect(await allowWebLinePilot("subject")).toBe(true);
  expect(mocks.findUnique).not.toHaveBeenCalled();
});
