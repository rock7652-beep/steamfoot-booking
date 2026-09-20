import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  customerIdentityLink: { findUnique: vi.fn() }, account: { findUnique: vi.fn() },
  customer: { findUnique: vi.fn(), findMany: vi.fn() }, user: { findUnique: vi.fn() },
}));
const membership = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMemberCustomerForStore: membership }));
import { resolveVerifiedLineCustomer } from "@/server/services/verified-line-customer";
const customer = { id: "c", name: "Member", lineName: null, userId: "u", storeId: "s", mergedIntoCustomerId: null, store: { slug: "shop" } };
beforeEach(() => {
  vi.resetAllMocks();
  db.customerIdentityLink.findUnique.mockResolvedValue({ userId: "u", customer });
  db.account.findUnique.mockResolvedValue({ userId: "u" });
  db.customer.findUnique.mockResolvedValue(customer);
  db.customer.findMany.mockResolvedValue([]);
  membership.mockResolvedValue({ customerId: "c", storeId: "s" });
  db.user.findUnique.mockResolvedValue({ id: "u", role: "CUSTOMER", status: "ACTIVE" });
});
describe("verified LINE customer resolution", () => {
  it("resolves the current LINE subject and exact store", async () => {
    expect(await resolveVerifiedLineCustomer("s", "line")).toMatchObject({ id: "c", userId: "u" });
    expect(membership).toHaveBeenCalledWith("u", "s");
  });
  it("supports a verified central account switching to its linked store", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    expect(await resolveVerifiedLineCustomer("s", "line")).toMatchObject({ id: "c" });
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
  it("does not fall back to a legacy phone/notification match for an unlinked store", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    membership.mockResolvedValue(null);
    expect(await resolveVerifiedLineCustomer("other", "line")).toBeNull();
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
  it("rejects conflicting Account and store link owners", async () => {
    db.account.findUnique.mockResolvedValue({ userId: "other" });
    expect(await resolveVerifiedLineCustomer("s", "line")).toBeNull();
  });
  it.each([
    { storeId: "other" }, { userId: "other" }, { mergedIntoCustomerId: "merged" },
  ])("rejects invalid customer ownership %j", async (change) => {
    db.customerIdentityLink.findUnique.mockResolvedValue({ userId: "u", customer: { ...customer, ...change } });
    expect(await resolveVerifiedLineCustomer("s", "line")).toBeNull();
  });
  it("rejects membership conflicts", async () => {
    membership.mockResolvedValue(null);
    expect(await resolveVerifiedLineCustomer("s", "line")).toBeNull();
  });
  it("allows an active owner account to enter the verified member context", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", role: "OWNER", status: "ACTIVE" });
    expect(await resolveVerifiedLineCustomer("s", "line")).toMatchObject({ id: "c", userId: "u" });
  });
  it("rejects inactive users", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", role: "CUSTOMER", status: "INACTIVE" });
    expect(await resolveVerifiedLineCustomer("s", "line")).toBeNull();
  });
  it("preserves a unique verified legacy identity", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    db.account.findUnique.mockResolvedValue(null);
    db.customer.findMany.mockResolvedValue([customer]);
    expect(await resolveVerifiedLineCustomer("s", "legacy")).toMatchObject({ id: "c" });
  });
  it("rejects ambiguous legacy matches", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    db.account.findUnique.mockResolvedValue(null);
    db.customer.findMany.mockResolvedValue([customer, { ...customer, id: "other" }]);
    expect(await resolveVerifiedLineCustomer("s", "legacy")).toBeNull();
  });
});

it("distinguishes identity conflicts from an unknown new customer for entry routing", async () => {
  db.account.findUnique.mockResolvedValue({ userId: "other" });
  await expect(resolveVerifiedLineCustomer("s", "line", { explainFailure: true })).rejects.toMatchObject({ reason: "account_owner_conflict" });
});
it("requires membership verification for an existing account at an unlinked store", async () => {
  db.customerIdentityLink.findUnique.mockResolvedValue(null);
  membership.mockResolvedValue(null);
  await expect(resolveVerifiedLineCustomer("s", "line", { explainFailure: true })).rejects.toMatchObject({ reason: "store_membership_unconfirmed" });
});
it("keeps a genuine unknown identity eligible for onboarding", async () => {
  db.customerIdentityLink.findUnique.mockResolvedValue(null);
  db.account.findUnique.mockResolvedValue(null);
  expect(await resolveVerifiedLineCustomer("s", "new", { explainFailure: true })).toBeNull();
});

it("never authorizes a different provider through the legacy notification id", async () => {
  db.customerIdentityLink.findUnique.mockResolvedValue(null);
  db.account.findUnique.mockResolvedValue(null);
  db.customer.findMany.mockResolvedValue([customer]);
  expect(await resolveVerifiedLineCustomer("s", "same-raw-subject", { identityProvider: "line-provider:901", explainFailure: true })).toBeNull();
  expect(db.customer.findMany).not.toHaveBeenCalled();
  expect(db.account.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerAccountId: { provider: "line-provider:901", providerAccountId: "same-raw-subject" } } }));
});
