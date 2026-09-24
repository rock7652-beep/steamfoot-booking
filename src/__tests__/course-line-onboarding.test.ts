import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = {
    account: { findUnique: vi.fn(), create: vi.fn() },
    customer: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    customerIdentityLink: { findMany: vi.fn(), create: vi.fn() },
    user: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn(), resolve: vi.fn(),
    account: { findUnique: vi.fn() }, store: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() }, customerIdentityLink: { findFirst: vi.fn() } };
});
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction,
  account: mocks.account, store: mocks.store, customer: mocks.customer,
  customerIdentityLink: mocks.customerIdentityLink } }));
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: mocks.resolve }));
import { canOnboardCentralLineAccountToCourse, onboardCourseLineMember } from "@/server/services/course-line-onboarding";
const input = { storeId: "course", lineUserId: "verified-subject", name: "Member", phone: "0999000123", lineName: "LINE name" };
const joiningInput = { storeId: input.storeId, lineUserId: input.lineUserId, identityProvider: "line" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue(null);
  mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.tx.account.findUnique.mockResolvedValue(null);
  mocks.tx.customer.findMany.mockResolvedValue([]);
  mocks.tx.customer.findFirst.mockResolvedValue(null);
  mocks.tx.customerIdentityLink.findMany.mockResolvedValue([]);
  mocks.tx.user.create.mockResolvedValue({ id: "new-user" });
  mocks.tx.customer.create.mockResolvedValue({ id: "new-member" });
  mocks.account.findUnique.mockResolvedValue({ userId: "central-user", user: { status: "ACTIVE" } });
  mocks.store.findUnique.mockResolvedValue({ industryModule: "COURSE" });
  mocks.customer.findFirst.mockResolvedValue(null);
  mocks.customerIdentityLink.findFirst.mockResolvedValue(null);
});

describe("central LINE account joining a course store", () => {
  it("offers onboarding only when there is no membership in the course store", async () => {
    expect(await canOnboardCentralLineAccountToCourse(joiningInput)).toBe(true);
    mocks.customer.findFirst.mockResolvedValue({ id: "existing" });
    expect(await canOnboardCentralLineAccountToCourse(joiningInput)).toBe(false);
    mocks.customer.findFirst.mockResolvedValue(null);
    mocks.customerIdentityLink.findFirst.mockResolvedValue({ id: "conflict" });
    expect(await canOnboardCentralLineAccountToCourse(joiningInput)).toBe(false);
  });
  it("rejects other modules and suspended global accounts", async () => {
    mocks.store.findUnique.mockResolvedValue({ industryModule: "STEAMFOOT" });
    expect(await canOnboardCentralLineAccountToCourse(joiningInput)).toBe(false);
    mocks.account.findUnique.mockResolvedValue({ userId: "central-user", user: { status: "SUSPENDED" } });
    expect(await canOnboardCentralLineAccountToCourse(joiningInput)).toBe(false);
  });
});

describe("course LINE onboarding", () => {
  it("returns an existing verified membership without any mutation", async () => {
    mocks.resolve.mockResolvedValue({ id: "member" });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "ok" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("creates all identity rows inside a serializable transaction", async () => {
    expect(await onboardCourseLineMember(input)).toEqual({ status: "ok" });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.tx.account.create).toHaveBeenCalledWith({ data: { userId: "new-user", type: "oauth", provider: "line", providerAccountId: input.lineUserId } });
    expect(mocks.tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId: "new-member", userId: "new-user", storeId: "course" }) });
  });
  it("reuses the verified global Account without creating or overwriting its User or Account", async () => {
    mocks.tx.account.findUnique.mockResolvedValue({ userId: "central-user", user: { status: "ACTIVE" } });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "ok" });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.account.create).not.toHaveBeenCalled();
    expect(mocks.tx.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: null, storeId: "course" }) }));
    expect(mocks.tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "central-user" }) });
  });
  it.each(["customer", "link", "legacy", "disabled"])("preserves conflicting %s data without writes", async (kind) => {
    mocks.tx.account.findUnique.mockResolvedValue({ userId: "central-user", user: { status: kind === "disabled" ? "INACTIVE" : "ACTIVE" } });
    if (kind === "customer") mocks.tx.customer.findMany.mockResolvedValue([{ id: "existing" }]);
    if (kind === "link") mocks.tx.customerIdentityLink.findMany.mockResolvedValue([{ id: "link" }]);
    if (kind === "legacy") mocks.tx.customer.findFirst.mockResolvedValue({ id: "existing" });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "identity_review_required" });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
    expect(mocks.tx.account.create).not.toHaveBeenCalled();
    expect(mocks.tx.customerIdentityLink.create).not.toHaveBeenCalled();
  });
  it("propagates Account failure out of the transaction and never creates a partial customer", async () => {
    mocks.tx.account.create.mockRejectedValue(new Error("conflict"));
    expect(await onboardCourseLineMember(input)).toEqual({ status: "service_unavailable" });
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
  });
  it("does not report success when store-link creation fails", async () => {
    mocks.tx.customerIdentityLink.create.mockRejectedValue(new Error("write failed"));
    expect(await onboardCourseLineMember(input)).toEqual({ status: "service_unavailable" });
  });
});

it("creates an independent provider identity without writing the legacy LINE subject column", async () => {
  const identityProvider = "line-provider:901";
  expect(await onboardCourseLineMember({ ...input, identityProvider })).toEqual({ status: "ok" });
  expect(mocks.tx.account.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { provider_providerAccountId: { provider: identityProvider, providerAccountId: input.lineUserId } },
  }));
  expect(mocks.tx.account.create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: identityProvider }) });
  expect(mocks.tx.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lineUserId: null }) }));
  expect(mocks.tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: identityProvider, storeId: input.storeId }) });
});
