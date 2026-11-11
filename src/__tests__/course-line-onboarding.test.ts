import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(), auditLog: { create: vi.fn() },
    account: { findUnique: vi.fn(), create: vi.fn() },
    customer: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    customerIdentityLink: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { create: vi.fn(), findUnique: vi.fn() },
  };
  return { tx, transaction: vi.fn(), resolve: vi.fn(), complete: vi.fn(), recovery: vi.fn(),
    account: { findUnique: vi.fn() }, store: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() }, customerIdentityLink: { findFirst: vi.fn() } };
});
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction,
  account: mocks.account, store: mocks.store, customer: mocks.customer,
  customerIdentityLink: mocks.customerIdentityLink } }));
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: mocks.resolve }));
vi.mock("@/server/services/store-member-connection", () => ({ completeAuthorizedFirstStoreLogin: mocks.complete }));
vi.mock("@/server/services/liff-login-recovery", () => ({ requestLiffLoginRecovery: mocks.recovery }));
import { canOnboardCentralLineAccountToCourse, onboardCourseLineMember, onboardOrRecoverCourseLineMember } from "@/server/services/course-line-onboarding";
const input = { storeId: "course", lineUserId: "verified-subject", name: "Member", phone: "0999000123", lineName: "LINE name" };
const joiningInput = { storeId: input.storeId, lineUserId: input.lineUserId, identityProvider: "line" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue(null);
  mocks.complete.mockResolvedValue(false);
  mocks.recovery.mockResolvedValue({ status: "pending", verificationCode: "ABC123" });
  mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.tx.account.findUnique.mockResolvedValue(null);
  mocks.tx.customer.findMany.mockResolvedValue([]);
  mocks.tx.customer.findFirst.mockResolvedValue(null);
  mocks.tx.customerIdentityLink.findMany.mockResolvedValue([]);
  mocks.tx.user.create.mockResolvedValue({ id: "new-user" });
  mocks.tx.user.findUnique.mockResolvedValue(null);
  mocks.tx.customerIdentityLink.findFirst.mockResolvedValue(null);
  mocks.tx.customer.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.customer.create.mockResolvedValue({ id: "new-member" });
  mocks.account.findUnique.mockResolvedValue({ userId: "central-user", user: { status: "ACTIVE" } });
  mocks.store.findUnique.mockResolvedValue({ industryModule: "COURSE" });
  mocks.customer.findFirst.mockResolvedValue(null);
  mocks.customerIdentityLink.findFirst.mockResolvedValue(null);
});

describe("existing course member Login recovery", () => {
  const verifiedInput = { ...input, channelId: "verified-channel" };
  beforeEach(() => { mocks.tx.customer.findMany.mockResolvedValue([{ id: "original-member", name: "Member", phone: input.phone, userId: "original-user", identityLinks: [] }]); });
  it("queues the verified Login for staff review without creating a duplicate member", async () => {
    expect(await onboardOrRecoverCourseLineMember(verifiedInput)).toEqual({ status: "login_review_pending", verificationCode: "ABC123" });
    expect(mocks.recovery).toHaveBeenCalledWith(verifiedInput);
    expect(mocks.tx.customer.create).not.toHaveBeenCalled(); expect(mocks.tx.account.create).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });
  it("consumes staff authorization on retry before requesting another confirmation", async () => {
    mocks.complete.mockResolvedValue(true);
    expect(await onboardOrRecoverCourseLineMember(verifiedInput)).toEqual({ status: "ok" });
    expect(mocks.complete).toHaveBeenCalledWith({ storeId: input.storeId, phone: input.phone, candidateLineUserId: input.lineUserId });
    expect(mocks.recovery).not.toHaveBeenCalled(); expect(mocks.tx.customer.create).not.toHaveBeenCalled();
  });
  it("keeps independent providers on their existing review path", async () => {
    expect(await onboardOrRecoverCourseLineMember({ ...verifiedInput, identityProvider: "line-provider:901" })).toEqual({ status: "identity_review_required" });
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.recovery).not.toHaveBeenCalled();
  });
  it.each(["review", "unavailable"])("preserves %s instead of claiming a successful login", async status => {
    mocks.recovery.mockResolvedValue({ status });
    expect(await onboardOrRecoverCourseLineMember(verifiedInput)).toEqual({ status: status === "review" ? "identity_review_required" : "service_unavailable" });
  });
  it("does not turn a failed identity lookup into registration or recovery", async () => {
    mocks.resolve.mockRejectedValue(new Error("lookup down"));
    expect(await onboardOrRecoverCourseLineMember(verifiedInput)).toEqual({ status: "service_unavailable" });
    expect(mocks.recovery).not.toHaveBeenCalled(); expect(mocks.tx.customer.create).not.toHaveBeenCalled();
  });
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

const unowned = { id: "precreated", name: input.name, phone: input.phone, userId: null,
  lineUserId: null, googleId: null, lineBindingCode: null, mergedIntoCustomerId: null, identityLinks: [] };
describe("single precreated course learner first activation", () => {
  beforeEach(() => { mocks.tx.customer.findMany.mockResolvedValue([unowned]); });
  it.each(["line", "line-provider:901"])("activates the same learner for verified provider %s without staff review or a group grant", async identityProvider => {
    expect(await onboardOrRecoverCourseLineMember({ ...input, identityProvider, channelId: "verified" })).toEqual({ status: "ok" });
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.recovery).not.toHaveBeenCalled();
    expect(mocks.tx.customer.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: unowned.id, userId: null, identityLinks: { none: {} } }), data: expect.objectContaining({ userId: "new-user" }) });
    expect(mocks.tx.account.create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: identityProvider }) });
    expect(mocks.tx.customerIdentityLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId: unowned.id, provider: identityProvider }) });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetId: unowned.id, action: "FIRST_LINE_LOGIN_NAME_PHONE_MATCH" }) });
    const updated=mocks.tx.customer.updateMany.mock.calls[0][0].data;
    expect(updated).not.toHaveProperty("name"); expect(updated).not.toHaveProperty("phone");
    if(identityProvider!=="line")expect(updated).not.toHaveProperty("lineUserId");
  });
  it.each([
    ["name mismatch", { name: "Someone else" }], ["already owned", { userId: "owner" }],
    ["Google identity", { googleId: "google" }], ["binding in progress", { lineBindingCode: "code" }],
    ["other LINE", { lineUserId: "different" }], ["merged record", { mergedIntoCustomerId: "kept" }],
    ["scoped identity", { identityLinks: [{ id: "link" }] }], ["contact only", { phone: "" }],
  ])("keeps %s on the review path without writes", async (_label, fields) => {
    mocks.tx.customer.findMany.mockResolvedValue([{ ...unowned, ...fields }]);
    expect(await onboardCourseLineMember(input)).toEqual({ status: "identity_review_required" });
    expect(mocks.tx.user.create).not.toHaveBeenCalled(); expect(mocks.tx.customer.updateMany).not.toHaveBeenCalled();
  });
  it("does not activate a phone group even when one name matches", async () => {
    mocks.tx.customer.findMany.mockResolvedValue([unowned, { ...unowned, id: "sibling", phone: "", name: "Sibling" }]);
    expect(await onboardCourseLineMember(input)).toEqual({ status: "identity_review_required" });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ phone: "", contactPhone: input.phone }]) }) }));
  });
  it.each(["phoneOwner", "providerLink"])("blocks an existing %s", async conflict => {
    (conflict === "phoneOwner" ? mocks.tx.user.findUnique : mocks.tx.customerIdentityLink.findFirst).mockResolvedValue({ id: "existing" });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "identity_review_required" });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });
  it("does not complete activation when its conditional claim loses the race", async () => {
    mocks.tx.customer.updateMany.mockResolvedValue({ count: 0 });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "service_unavailable" });
    expect(mocks.tx.account.create).not.toHaveBeenCalled(); expect(mocks.tx.customerIdentityLink.create).not.toHaveBeenCalled();
  });
  it("does not report success if the atomic audit fails", async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));
    expect(await onboardCourseLineMember(input)).toEqual({ status: "service_unavailable" });
  });
});
