import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ account: vi.fn(), membership: vi.fn(), fallback: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.account } } }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMemberCustomerForStore: m.membership }));
vi.mock("@/server/queries/customer-completion", () => ({ resolveCustomerForUser: m.fallback }));
import { getCanonicalCustomerForSession } from "@/lib/customer-identity";
const user = { id: "user-a", storeId: "store-a", customerId: "stale-b", email: "same-contact@example.invalid" };
beforeEach(() => { vi.clearAllMocks(); m.account.mockResolvedValue({ status: "ACTIVE", updatedAt: new Date("2026-11-26T04:00:00Z") }); m.membership.mockResolvedValue({ userId: "user-a", storeId: "store-a", customerId: "customer-a" }); });
it("confirmed reads ignore stale customer IDs and contacts, and never run binding recovery", async () => {
  expect(await getCanonicalCustomerForSession(user, { confirmedOnly: true })).toEqual({ id: "customer-a", storeId: "store-a", recoveredFromStaleSession: true, verifiedUserVersion: "2026-11-26T04:00:00.000Z" });
  expect(m.membership).toHaveBeenCalledWith("user-a", "store-a"); expect(m.fallback).not.toHaveBeenCalled();
});
it("an unconfirmed relationship does not fall through to email/phone recovery", async () => {
  m.membership.mockResolvedValue(null); expect(await getCanonicalCustomerForSession(user, { confirmedOnly: true })).toBe(null); expect(m.fallback).not.toHaveBeenCalled();
});
it.each([null, "__all__"])("an absent or all-store scope %s cannot query identity", async storeId => {
  expect(await getCanonicalCustomerForSession({ ...user, storeId }, { confirmedOnly: true })).toBe(null); expect(m.account).not.toHaveBeenCalled();
});
it("inactive or missing accounts cannot retain identity through an old JWT", async () => {
  m.account.mockResolvedValueOnce({ status: "SUSPENDED" }).mockResolvedValueOnce(null);
  expect(await getCanonicalCustomerForSession(user, { confirmedOnly: true })).toBe(null);
  expect(await getCanonicalCustomerForSession(user, { confirmedOnly: true })).toBe(null); expect(m.membership).not.toHaveBeenCalled();
});
it.each([{ userId: "foreign", storeId: "store-a" }, { userId: "user-a", storeId: "foreign" }])("rejects inconsistent confirmed identity", async drift => {
  m.membership.mockResolvedValue({ ...drift, customerId: "customer-a" }); expect(await getCanonicalCustomerForSession(user, { confirmedOnly: true })).toBe(null);
});
it("identity dependency errors do not become contact-based recovery", async () => {
  m.membership.mockRejectedValue(new Error("UNAVAILABLE")); await expect(getCanonicalCustomerForSession(user, { confirmedOnly: true })).rejects.toThrow("UNAVAILABLE"); expect(m.fallback).not.toHaveBeenCalled();
});
it("existing callers retain the established resolver contract", async () => {
  m.fallback.mockResolvedValue({ customer: { id: "legacy", storeId: "store-a" }, reason: "found_by_userid" });
  expect(await getCanonicalCustomerForSession(user)).toEqual({ id: "legacy", storeId: "store-a", recoveredFromStaleSession: true });
  expect(m.account).not.toHaveBeenCalled(); expect(m.membership).not.toHaveBeenCalled();
});
