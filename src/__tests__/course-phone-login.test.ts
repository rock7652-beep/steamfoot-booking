import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ manager: vi.fn(), managerRead: vi.fn(), verified: vi.fn(), context: vi.fn(), permission: vi.fn(),
  rows: vi.fn(), customerFind: vi.fn(), customerUpdate: vi.fn(), userFind: vi.fn(), phoneOwner: vi.fn(), userCreate: vi.fn(), accountFind: vi.fn(), accountCreate: vi.fn(), links: vi.fn(), linkCreate: vi.fn(),
  requestFind: vi.fn(), previous: vi.fn(), requestUpsert: vi.fn(), requestUpdate: vi.fn(), rejectOther: vi.fn(), pending: vi.fn(), grant: vi.fn(), upsertGrant: vi.fn(), audit: vi.fn(), store: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseManagerRead: m.managerRead }));
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: m.verified }));
vi.mock("@/server/services/store-liff-context", () => ({ resolveStoreLiffContext: m.context }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission, isOwner: (role: string) => role === "ADMIN", isNonOwnerStaff: (role: string) => ["OWNER", "MANAGER", "PARTNER"].includes(role) }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store }, $transaction: async (run: (tx: unknown) => unknown) => run({
  $queryRaw: vi.fn(), customer: { findMany: m.rows, findFirst: m.customerFind, update: m.customerUpdate },
  user: { findFirst: m.userFind, findUnique: m.phoneOwner, create: m.userCreate }, account: { findUnique: m.accountFind, create: m.accountCreate }, customerIdentityLink: { findMany: m.links, create: m.linkCreate },
  storeMemberConnection: { findFirst: m.requestFind, findUnique: m.previous, upsert: m.requestUpsert, update: m.requestUpdate, updateMany: m.rejectOther, findMany: m.pending },
  coursePhoneViewGrant: { findFirst: m.grant, upsert: m.upsertGrant }, auditLog: { create: m.audit },
}) } }));
import { requestCoursePhoneLogin, approveCoursePhoneLogin, readCoursePhoneConnection } from "@/server/services/course-phone-login";
const subject = "U" + "a".repeat(32), phone = "0912345678", provider = "line-provider:123";
const key = `course-phone:${createHash("sha256").update(provider).digest("hex")}:${subject}`;
const input = { storeId: "store", identityProvider: provider, channelId: "channel", lineUserId: subject, phone };
const anchor = { id: "child-a", name: "孩子 A", phone, contactPhone: null, userId: null, lineUserId: null, googleId: null, lineBindingCode: null, assignedStaffId: "staff", identityLinks: [] };
const sibling = { ...anchor, id: "child-b", name: "孩子 B", phone: "", contactPhone: phone };
const pending = { id: "request", storeId: "store", customerId: anchor.id, phone, status: "PENDING", expiresAt: new Date(Date.now() + 3600_000), verificationCode: "ABC123", channelKey: "course-phone:channel", identityProvider: provider, lineUserId: key };
const confirm = { requestId: pending.id, customerId: anchor.id, verificationCode: pending.verificationCode };
beforeEach(() => {
  vi.resetAllMocks();
  const actor = { storeId: "store", user: { id: "manager", role: "OWNER", staffId: "staff" } };
  m.manager.mockResolvedValue(actor); m.managerRead.mockResolvedValue(actor); m.permission.mockResolvedValue(true);
  m.store.mockResolvedValue({ slug: "store-slug" }); m.context.mockResolvedValue({ identityProvider: provider, channelId: "channel" });
  m.verified.mockResolvedValue(null); m.rows.mockResolvedValue([anchor, sibling]); m.customerFind.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? anchor : null);
  m.accountFind.mockResolvedValue(null); m.links.mockResolvedValue([]); m.userFind.mockResolvedValue({ id: "member" }); m.phoneOwner.mockResolvedValue(null);
  m.userCreate.mockResolvedValue({ id: "member" }); m.previous.mockResolvedValue(null); m.requestFind.mockResolvedValue(pending);
  m.requestUpsert.mockResolvedValue({ id: pending.id }); m.upsertGrant.mockResolvedValue({ id: "grant" }); m.pending.mockResolvedValue([]); m.grant.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it("creates only a pending request for a verified LINE subject, reuses its code on retries and never reveals names", async () => {
  const first = await requestCoursePhoneLogin(input);
  expect(first).toMatchObject({ status: "login_review_pending", referenceId: "request" });
  expect(first).not.toHaveProperty("learners"); expect(first).not.toHaveProperty("name");
  const data = m.requestUpsert.mock.calls[0][0].create;
  m.previous.mockResolvedValue({ ...data, id: "request" });
  expect(await requestCoursePhoneLogin(input)).toEqual(first);
  expect(m.userCreate).not.toHaveBeenCalled(); expect(m.customerUpdate).not.toHaveBeenCalled(); expect(m.linkCreate).not.toHaveBeenCalled(); expect(m.upsertGrant).not.toHaveBeenCalled();
});
it("asks for the student's name only for a genuinely new phone and validates invalid phones", async () => {
  m.rows.mockResolvedValue([]);
  expect(await requestCoursePhoneLogin(input)).toEqual({ status: "needs_name" });
  expect(await requestCoursePhoneLogin({ ...input, phone: "bad" })).toEqual({ status: "invalid_phone" });
  expect(m.requestUpsert).not.toHaveBeenCalled();
});
it("reuses already verified local membership, and does not replace an in-flight request with another phone", async () => {
  m.verified.mockResolvedValueOnce({ id: anchor.id });
  expect(await requestCoursePhoneLogin(input)).toEqual({ status: "ok" });
  m.previous.mockResolvedValue({ ...pending, phone: "0987654321" });
  expect(await requestCoursePhoneLogin(input)).toEqual({ status: "identity_review_required" });
  expect(m.requestUpsert).not.toHaveBeenCalled();
});
it("staff approval creates one Login identity and group grant without creating an adult Customer or renaming a child", async () => {
  await approveCoursePhoneLogin(confirm);
  expect(m.manager).toHaveBeenCalledWith("customer.update");
  expect(m.customerUpdate.mock.calls[0][0]).toEqual({ where: { id: anchor.id }, data: { phone, contactPhone: null, userId: "member", authSource: "LINE" } });
  expect(m.accountCreate.mock.calls[0][0].data).toMatchObject({ provider, providerAccountId: subject, userId: "member" });
  expect(m.linkCreate.mock.calls[0][0].data).toMatchObject({ customerId: anchor.id, storeId: "store", userId: "member", provider });
  expect(m.upsertGrant.mock.calls[0][0].create).toMatchObject({ anchorCustomerId: anchor.id, userId: "member", phone, confirmedByUserId: "manager" });
  expect(m.rejectOther).toHaveBeenCalled(); expect(m.audit.mock.calls[0][0].data.action).toBe("APPROVE_COURSE_PHONE_LOGIN");
});
it("replays an approval without minting another identity or resurrecting a revoked grant", async () => {
  m.requestFind.mockResolvedValue({ ...pending, status: "APPROVED" });
  await approveCoursePhoneLogin(confirm);
  expect(m.userCreate).not.toHaveBeenCalled(); expect(m.upsertGrant).not.toHaveBeenCalled(); expect(m.customerUpdate).not.toHaveBeenCalled();
});
it.each([
  { verificationCode: "FFFFFF" }, { identityProvider: "different-provider" }, { channelKey: "course-phone:other-channel" },
  { expiresAt: new Date(0) }, { status: "REJECTED" }, { lineUserId: "unverified-subject" },
])("rejects stale or forged confirmation %j", async changes => {
  m.requestFind.mockResolvedValue({ ...pending, ...changes });
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow();
  expect(m.userCreate).not.toHaveBeenCalled(); expect(m.customerUpdate).not.toHaveBeenCalled(); expect(m.upsertGrant).not.toHaveBeenCalled();
});
it("does not overwrite another account, a sibling's identity, or an unrelated phone/password owner", async () => {
  m.phoneOwner.mockResolvedValueOnce({ id: "other-user" });
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow("其他帳號");
  m.rows.mockResolvedValueOnce([anchor, { ...sibling, googleId: "own-google" }]);
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow("獨立身分");
  m.customerFind.mockResolvedValueOnce({ ...anchor, userId: "existing" }); m.accountFind.mockResolvedValueOnce({ userId: "other" });
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow("其他登入身分");
  expect(m.upsertGrant).not.toHaveBeenCalled(); expect(m.customerUpdate).not.toHaveBeenCalled();
});
it("keeps a central Account's other-store legacy Customer and uses the scoped link for this store", async () => {
  m.accountFind.mockResolvedValue({ userId: "central-member" });
  m.customerFind.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? anchor : { id: "other-store-legacy" });
  await approveCoursePhoneLogin(confirm);
  expect(m.userCreate).not.toHaveBeenCalled(); expect(m.accountCreate).not.toHaveBeenCalled();
  expect(m.customerUpdate.mock.calls[0][0].data).not.toHaveProperty("userId");
  expect(m.linkCreate.mock.calls[0][0].data.userId).toBe("central-member");
});

it("keeps an existing staff-role central account in member context without changing its persisted role", async () => {
  m.accountFind.mockResolvedValue({ userId: "central-owner" });
  m.userFind.mockImplementation(async ({ where }: { where: { role?: string } }) => where.role ? null : { id: "central-owner", role: "OWNER" });
  await approveCoursePhoneLogin(confirm);
  expect(m.userCreate).not.toHaveBeenCalled();
  expect(m.upsertGrant.mock.calls[0][0].create.userId).toBe("central-owner");
});
it("does not permit ordinary staff or a SELF_ONLY manager to confirm another manager's group", async () => {
  m.manager.mockResolvedValueOnce({ user: { id: "staff", role: "PARTNER", staffId: "staff" }, storeId: "store" });
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow("店長");
  vi.stubEnv("MANAGER_VISIBILITY_MODE", "SELF_ONLY");
  const actor = { user: { id: "manager", role: "MANAGER", staffId: "staff" }, storeId: "store" };
  m.manager.mockResolvedValue(actor); m.managerRead.mockResolvedValue(actor);
  m.rows.mockResolvedValue([anchor, { ...sibling, assignedStaffId: "other-staff" }]);
  await expect(approveCoursePhoneLogin(confirm)).rejects.toThrow("可管理範圍");
  await expect(readCoursePhoneConnection(anchor.id)).rejects.toThrow("可管理範圍");
  expect(m.userCreate).not.toHaveBeenCalled(); expect(m.upsertGrant).not.toHaveBeenCalled();
});
it("shows a sibling's confirmation on its shared phone anchor while respecting update permission", async () => {
  m.customerFind.mockResolvedValue(sibling); m.pending.mockResolvedValue([{ id: "request", verificationCode: "ABC123" }]); m.permission.mockResolvedValue(false);
  expect(await readCoursePhoneConnection(sibling.id)).toMatchObject({ anchorCustomerId: anchor.id, learnerCount: 2, canConfirm: false, pending: [{ id: "request" }] });
  expect(m.pending.mock.calls[0][0].where).toMatchObject({ storeId: "store", customerId: anchor.id, status: "PENDING", phone });
});
