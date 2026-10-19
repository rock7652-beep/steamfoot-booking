import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), access: vi.fn(), context: vi.fn(), module: vi.fn(),
  store: { findUnique: vi.fn() }, customer: { findMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() }, account: { findUnique: vi.fn(), findMany: vi.fn() },
  link: { findFirst: vi.fn(), findMany: vi.fn() },
  request: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  grant: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, audit: vi.fn() }));
const tx = { $queryRaw: vi.fn(), customer: m.customer, user: m.user, account: m.account,
  customerIdentityLink: m.link, storeMemberConnection: m.request, lineRebindRequest: m.grant, auditLog: { create: m.audit } };
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction, store: m.store } }));
vi.mock("@/lib/industry-module-server", () => ({ requireSteamfootStore: m.module }));
vi.mock("@/server/services/inventory", () => ({ inventoryTransactionAccess: m.access }));
vi.mock("@/server/services/store-liff-context", () => ({ resolveStoreLiffContext: m.context }));
import { requestLiffLoginRecovery, approveLiffLoginRecovery } from "@/server/services/liff-login-recovery";
import { sha256 } from "@/server/services/line-rebind";
import type { InventoryContext } from "@/server/services/inventory";
const input = { storeId: "s", channelId: "123", lineUserId: "U-verified", phone: "0912345678" };
const fingerprint = sha256(JSON.stringify(["s", "line", input.lineUserId]));
const customer = { id: "c", name: "會員", phone: input.phone, userId: "u", mergedIntoCustomerId: null, identityLinks: [{ userId: "u" }] };
const ctx = { storeId: "s", user: { id: "staff", role: "OWNER" } } as unknown as InventoryContext;
const pending = () => ({ id: "r", storeId: "s", customerId: "c", phone: input.phone, identityProvider: "line", channelKey: "login:123",
  lineUserId: "login:" + fingerprint, verificationCode: "ABC123", status: "PENDING", expiresAt: new Date(Date.now() + 60_000) });
beforeEach(() => {
  vi.resetAllMocks();
  m.transaction.mockImplementation(async callback => callback(tx));
  m.access.mockResolvedValue(() => true);
  m.store.findUnique.mockResolvedValue({ slug: "store" });
  m.context.mockResolvedValue({ identityProvider: "line", channelId: "123", config: null });
  m.customer.findMany.mockResolvedValue([customer]);
  m.account.findUnique.mockResolvedValue(null); m.account.findMany.mockResolvedValue([{ providerAccountId: "old" }]);
  m.link.findFirst.mockResolvedValue(null); m.link.findMany.mockResolvedValue([{ userId: "u", providerAccountId: "old", lineUserId: "old" }]);
  m.user.findUnique.mockResolvedValue({ status: "ACTIVE", role: "CUSTOMER" });
  m.user.create.mockResolvedValue({ id: "new-user" });
  m.request.findUnique.mockResolvedValue(null); m.request.findFirst.mockResolvedValue(pending());
  m.grant.findFirst.mockResolvedValue(null); m.grant.create.mockResolvedValue({ id: "grant" });
});
describe("verified login recovery request", () => {
  it("only queues a fingerprint and code; preserves account, membership and notification", async () => {
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "pending", verificationCode: expect.stringMatching(/^[A-F0-9]{6}$/) });
    expect(m.request.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      lineUserId: "login:" + fingerprint, channelKey: "login:123", status: "PENDING", centralUserId: null,
    }) }));
    expect(JSON.stringify(m.request.upsert.mock.calls)).not.toContain(input.lineUserId);
    expect(m.customer.update).not.toHaveBeenCalled(); expect(m.grant.create).not.toHaveBeenCalled(); expect(m.user.create).not.toHaveBeenCalled();
  });
  it("keeps the same pending code and expiry on repeated submissions", async () => {
    const previous = pending(); m.request.findUnique.mockResolvedValue(previous);
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "pending", verificationCode: "ABC123" });
    expect(m.request.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ expiresAt: previous.expiresAt }) }));
  });
  it("requires new confirmation after expiry instead of reusing approval", async () => {
    m.request.findUnique.mockResolvedValue({ ...pending(), status: "APPROVED", expiresAt: new Date(0) });
    expect(await requestLiffLoginRecovery(input)).toMatchObject({ status: "pending" });
    expect(m.request.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ status: "PENDING", confirmedAt: null, confirmedByUserId: null }) }));
  });
  it.each([[], [customer, { ...customer, id: "duplicate" }]].map(rows => ({ rows })))("does not queue ambiguous/missing phones", async ({ rows }) => {
    m.customer.findMany.mockResolvedValue(rows);
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "review" }); expect(m.request.upsert).not.toHaveBeenCalled();
  });
  it("rejects a candidate account owned by somebody else", async () => {
    m.account.findUnique.mockResolvedValue({ userId: "other" });
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "review" }); expect(m.request.upsert).not.toHaveBeenCalled();
  });
  it("rejects a candidate already linked to another store member", async () => {
    m.link.findFirst.mockResolvedValue({ id: "conflict" });
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "review" }); expect(m.request.upsert).not.toHaveBeenCalled();
  });
  it("keeps lookup outages retryable", async () => {
    m.customer.findMany.mockRejectedValue(new Error("db down"));
    expect(await requestLiffLoginRecovery(input)).toEqual({ status: "unavailable" });
  });
});
describe("staff approval of verified login recovery", () => {
  it("creates an exact one-time grant and audit, without changing notification or Login credentials", async () => {
    await approveLiffLoginRecovery(ctx, "r", "c", "ABC123");
    expect(m.grant.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      storeId: "s", customerId: "c", createdByUserId: "staff", phoneHash: sha256(input.phone), oldUserIdHash: sha256("old"),
      reason: "LIFF_LOGIN_CHANNEL_MIGRATION_V1:verified:" + fingerprint, status: "PENDING_CAPTURE",
      untilUsed: true,
    }) });
    expect(m.customer.update).not.toHaveBeenCalled(); expect(m.audit).toHaveBeenCalledOnce();
    expect(m.grant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXPIRED" }) }));
  });
  it("preserves an existing matching grant and upgrades it until used", async () => {
    m.grant.findFirst.mockResolvedValue({ id: "existing", status: "PENDING_CAPTURE", consumedAt: null,
      reason: "LIFF_LOGIN_CHANNEL_MIGRATION_V1:verified:" + fingerprint,
      phoneHash: sha256(input.phone), oldUserIdHash: sha256("old") });
    m.grant.update.mockResolvedValue({ id: "existing" });
    await approveLiffLoginRecovery(ctx, "r", "c", "ABC123");
    expect(m.grant.update).toHaveBeenCalledWith({ where: { id: "existing" }, data: { untilUsed: true } });
    expect(m.grant.create).not.toHaveBeenCalled();
    expect(m.grant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ untilUsed: false }) }));
  });
  it("creates an owner and pinned FIRST capture only after staff confirms an unowned trial record", async () => {
    m.customer.findMany.mockResolvedValue([{ ...customer, userId: null, identityLinks: [] }]);
    m.user.findUnique.mockResolvedValue(null); m.account.findMany.mockResolvedValue([]); m.link.findMany.mockResolvedValue([]);
    await approveLiffLoginRecovery(ctx, "r", "c", "ABC123");
    expect(m.customer.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { userId: "new-user" } });
    expect(m.grant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reason: "LIFF_LOGIN_FIRST_CAPTURE_V1:verified:" + fingerprint, oldUserIdHash: null }) });
  });
  it.each([
    { status: "PENDING", expiresAt: new Date(0) }, { channelKey: "login:changed" }, { channelKey: "messaging" }, { lineUserId: "unverified" },
  ])("rejects stale, wrong-channel and notification requests: %o", async changes => {
    m.request.findFirst.mockResolvedValue({ ...pending(), ...changes });
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow(); expect(m.grant.create).not.toHaveBeenCalled();
  });
  it("rechecks revoked staff permissions before approving", async () => {
    m.access.mockResolvedValue(() => false);
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow(/權限/); expect(m.request.findFirst).not.toHaveBeenCalled();
  });
  it("does not replace a different active recovery", async () => {
    m.grant.findFirst.mockResolvedValue({ reason: "different", status: "PENDING_CAPTURE" });
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow(/其他身分/); expect(m.grant.create).not.toHaveBeenCalled();
  });
  it("rejects an inactive owner", async () => {
    m.user.findUnique.mockResolvedValue({ status: "SUSPENDED", role: "CUSTOMER" });
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow(); expect(m.grant.create).not.toHaveBeenCalled();
  });
  it("rejects a stale panel confirmation code after the request was renewed", async () => {
    m.request.findFirst.mockResolvedValue({ ...pending(), verificationCode: "NEW123" });
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow();
    expect(m.grant.create).not.toHaveBeenCalled();
  });
  it("does not report expired or already-approved requests as newly authorized", async () => {
    m.request.findFirst.mockResolvedValue({ ...pending(), status: "APPROVED" });
    await expect(approveLiffLoginRecovery(ctx, "r", "c", "ABC123")).rejects.toThrow(/已確認/);
    expect(m.grant.create).not.toHaveBeenCalled();
  });
});
