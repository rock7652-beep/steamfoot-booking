import { beforeEach, afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ manager: vi.fn(), member: vi.fn(), linked: vi.fn(), anchor: vi.fn(), rows: vi.fn(), user: vi.fn(), otherLink: vi.fn(), grant: vi.fn(), upsert: vi.fn(), update: vi.fn(), audit: vi.fn(), lock: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseMember: m.member }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMemberCustomerForStore: m.linked }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: async (run: (tx: unknown) => unknown) => run({
  $queryRaw: m.lock, customer: { findFirst: m.anchor, findMany: m.rows }, user: { findFirst: m.user },
  customerIdentityLink: { findFirst: m.otherLink },
  coursePhoneViewGrant: { findFirst: m.grant, upsert: m.upsert, update: m.update }, auditLog: { create: m.audit },
}) } }));
import { approveCoursePhoneView, readCoursePhoneLearners, revokeCoursePhoneView } from "@/server/services/course-phone-view";

const anchor = { id: "child-a", name: "孩子 A", phone: "0912345678", contactPhone: null, userId: "member", lineUserId: "line-a", googleId: null, lineBindingCode: null, assignedStaffId: "staff", identityLinks: [{ userId: "member" }] };
const child = (id: string) => ({ ...anchor, id, name: id, phone: "", contactPhone: anchor.phone, userId: null, lineUserId: null, identityLinks: [] });
const grant = { id: "grant", storeId: "store", userId: "member", anchorCustomerId: anchor.id, phone: anchor.phone, revokedAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  m.manager.mockResolvedValue({ user: { id: "manager", role: "OWNER", staffId: "staff" }, storeId: "store" });
  m.member.mockResolvedValue({ user: { id: "member" }, storeId: "store", customer: { id: anchor.id } });
  m.linked.mockResolvedValue({ customerId: anchor.id });
  m.anchor.mockResolvedValue(anchor); m.user.mockResolvedValue({ id: "member" }); m.otherLink.mockResolvedValue(null);
  m.rows.mockResolvedValue([anchor, child("child-b"), child("child-c"), child("relative-d")]);
  m.grant.mockResolvedValue(grant); m.upsert.mockResolvedValue(grant);
});
afterEach(() => vi.unstubAllEnvs());

it("confirms four independent learners without creating an adult or changing Login links", async () => {
  expect(await approveCoursePhoneView(anchor.id)).toEqual({ id: "grant", learnerCount: 4 });
  expect(m.manager).toHaveBeenCalledWith("customer.update");
  expect(m.upsert.mock.calls[0][0].create).toMatchObject({ userId: "member", anchorCustomerId: anchor.id, phone: anchor.phone, confirmedByUserId: "manager" });
  expect(m.audit.mock.calls[0][0].data).toMatchObject({ action: "APPROVE_COURSE_PHONE_VIEW", afterJson: { learnerCount: 4, readOnly: true } });
  expect(await readCoursePhoneLearners()).toEqual({ status: "phone_group", learners: [
    { id: "child-a", name: "孩子 A" }, { id: "child-b", name: "child-b" }, { id: "child-c", name: "child-c" }, { id: "relative-d", name: "relative-d" },
  ] });
  expect(m.rows.mock.calls[0][0].where).toEqual({ storeId: "store", mergedIntoCustomerId: null, OR: [{ phone: anchor.phone }, { phone: "", contactPhone: anchor.phone }] });
});

it("does not disclose siblings before confirmation or after revocation", async () => {
  m.grant.mockResolvedValue(null);
  expect(await readCoursePhoneLearners()).toEqual({ status: "personal", learners: [{ id: anchor.id, name: anchor.name }] });
  expect(m.rows).not.toHaveBeenCalled();
  expect(m.grant.mock.calls[0][0].where).toEqual({ storeId: "store", userId: "member", anchorCustomerId: anchor.id, phone: anchor.phone, revokedAt: null });
});

it("preserves a verified member session for a parent whose persisted account also has a staff role", async () => {
  m.user.mockImplementation(async ({ where }: { where: { role?: string } }) => where.role ? null : { id: "member", role: "OWNER" });
  expect((await readCoursePhoneLearners()).status).toBe("phone_group");
  expect(await approveCoursePhoneView(anchor.id)).toMatchObject({ learnerCount: 4 });
  expect(m.user.mock.calls[0][0].where).toEqual({ id: "member", status: "ACTIVE" });
});

it("reads fresh membership on each request, including a newly added child", async () => {
  expect((await readCoursePhoneLearners()).learners).toHaveLength(4);
  m.rows.mockResolvedValue([anchor, child("new-child")]);
  expect((await readCoursePhoneLearners()).learners.map(row => row.id)).toEqual([anchor.id, "new-child"]);
  m.grant.mockResolvedValue(null);
  expect((await readCoursePhoneLearners()).status).toBe("personal");
});

it("blocks staff without permission and ordinary staff even if the permission guard returned them", async () => {
  m.manager.mockRejectedValueOnce(new Error("permission denied"));
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("permission denied");
  m.manager.mockResolvedValue({ user: { id: "staff", role: "PARTNER", staffId: "staff" }, storeId: "store" });
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("店長");
  await expect(revokeCoursePhoneView("grant")).rejects.toThrow("店長");
  expect(m.upsert).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});

it("requires an existing verified owner, never granting authority from a phone or legacy userId alone", async () => {
  m.anchor.mockResolvedValue({ ...anchor, identityLinks: [] });
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("登入身分確認");
  expect(m.upsert).not.toHaveBeenCalled();
});

it.each([
  { userId: "another-user" }, { identityLinks: [{ userId: "another-user" }] },
  { lineUserId: "another-line" }, { googleId: "google" }, { lineBindingCode: "123456" },
])("rejects a sibling with conflicting personal identity %j", async identity => {
  m.rows.mockResolvedValue([anchor, { ...child("conflict"), ...identity }]);
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("店家確認");
  await expect(readCoursePhoneLearners()).rejects.toThrow("店家確認");
  expect(m.upsert).not.toHaveBeenCalled();
});

it("does not grant a SELF_ONLY manager access over someone else's learners", async () => {
  vi.stubEnv("MANAGER_VISIBILITY_MODE", "SELF_ONLY");
  m.manager.mockResolvedValue({ user: { id: "manager", role: "MANAGER", staffId: "staff" }, storeId: "store" });
  m.rows.mockResolvedValue([anchor, { ...child("sibling"), assignedStaffId: "other-staff" }]);
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("超出可管理範圍");
  expect(m.anchor.mock.calls[0][0].where).toMatchObject({ storeId: "store", assignedStaffId: "staff" });
  expect(m.upsert).not.toHaveBeenCalled();
});

it("fails closed for a changed member/store identity, disabled user or duplicate store membership", async () => {
  m.linked.mockResolvedValueOnce({ customerId: "other-child" });
  await expect(readCoursePhoneLearners()).rejects.toThrow("登入身分");
  m.user.mockResolvedValueOnce(null);
  await expect(readCoursePhoneLearners()).rejects.toThrow("無法使用");
  m.otherLink.mockResolvedValue({ id: "other-store-member" });
  await expect(readCoursePhoneLearners()).rejects.toThrow("登入身分");
  await expect(approveCoursePhoneView(anchor.id)).rejects.toThrow("多筆學員");
});

it("scopes revocation to the current authorized store and audits it, with idempotent repeats", async () => {
  await revokeCoursePhoneView("grant");
  expect(m.grant).toHaveBeenCalledWith({ where: { id: "grant", storeId: "store" } });
  expect(m.update).toHaveBeenCalledOnce();
  expect(m.audit.mock.calls[0][0].data.action).toBe("REVOKE_COURSE_PHONE_VIEW");
  m.grant.mockResolvedValue({ ...grant, revokedAt: new Date() });
  await revokeCoursePhoneView("grant");
  expect(m.update).toHaveBeenCalledOnce();
  m.grant.mockResolvedValue(null);
  await expect(revokeCoursePhoneView("another-store-grant")).rejects.toThrow("找不到");
});
