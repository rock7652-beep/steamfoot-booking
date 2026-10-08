import { beforeEach, expect, it, vi } from "vitest";
import { musicSourceTeacherDraftRecords } from "@/lib/music-source-teacher-draft";
const m = vi.hoisted(() => ({ target: vi.fn(), raw: vi.fn(), execute: vi.fn(), staffUpdate: vi.fn(), userUpdate: vi.fn(), permission: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => ({ id: "synthetic-owner", role: "OWNER", staffId: "synthetic-owner-staff" }) }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: async () => "store-lubymusic" }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findUnique: m.target, findFirst: m.target }, $transaction: m.transaction } }));
vi.mock("@/lib/permissions", () => ({ ALL_PERMISSIONS: ["staff.manage"], checkPermission: async () => true, getDefaultPermissionsForRole: () => [] }));
vi.mock("@/lib/staff-role-policy", () => ({ canManageStaffRole: () => true, canAssignStaffRole: () => true, assertStoreRetainsOwner: async () => {}, readStaffManagerGrants: async () => null }));
vi.mock("@/lib/revalidation", () => ({ revalidateStaff: vi.fn(), revalidateStaffPermissions: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: async () => {}, getStoreLimitsByStoreId: async () => ({ maxStaff: null }) }));
vi.mock("@/server/services/operation-audit", () => ({ recordOperationAudit: m.audit }));
vi.mock("@/server/services/course-access", () => ({ courseManager: async () => ({ storeId: "store-lubymusic", user: { id: "synthetic-owner", role: "OWNER", staffId: "synthetic-owner-staff" } }), courseTransaction: async (_: unknown, work: (tx: unknown) => unknown) => m.transaction(work) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
import { activateStaff, deactivateStaff, resetStaffPasswordAction, updateStaffPermissionsAction, updateStaff } from "@/server/actions/staff";
import { batchCourseStatus, applyCourseBatchStatus } from "@/server/actions/course-batch";
const records = musicSourceTeacherDraftRecords({ version: 1, marker: "SOURCE_REPLICA", targetStoreId: "store-lubymusic", sourceSystem: "YINJIAOYUN", sourceTenantKey: "www.injiaoyun.com:store-lubymusic", sourceTeacherId: "synthetic-teacher", sourceRevision: "synthetic-revision", sourceDisplayName: "Synthetic teacher" });
beforeEach(() => {
  vi.resetAllMocks();
  m.target.mockResolvedValue({ ...records.staff, user: records.user });
  m.raw.mockImplementation(async (strings: TemplateStringsArray) => strings.join("").includes('FROM "Staff"') ? [records.staff] : []);
  m.transaction.mockImplementation(async work => work({
    $queryRaw: m.raw, $executeRaw: m.execute,
    staff: { findUniqueOrThrow: m.target, update: m.staffUpdate }, user: { update: m.userUpdate },
    staffPermission: { upsert: m.permission, findMany: async () => [] },
  }));
});
function expectHeld(result: { success: boolean; error?: string }) {
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("來源教師") });
  expect(m.staffUpdate).not.toHaveBeenCalled(); expect(m.userUpdate).not.toHaveBeenCalled();
  expect(m.permission).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  for (const call of m.execute.mock.calls) expect(call[0].join("?")).toContain("SELECT pg_advisory_xact_lock");
}
it("generic activateStaff cannot enable Staff or User", async () => { expectHeld(await activateStaff(records.staffId)); });
it.each([
  { status: "ACTIVE" }, { role: "OWNER" }, { email: "synthetic@example.invalid" }, { permissions: { "staff.manage": true } }, { applyRolePreset: true },
] as const)("generic updateStaff holds %j before any state change", async input => { expectHeld(await updateStaff(records.staffId, input)); });
it("generic resetStaffPasswordAction cannot create credentials", async () => { expectHeld(await resetStaffPasswordAction({ userId: records.userId, newPassword: "synthetic-password" })); });
it("generic permission editor cannot grant source-draft access", async () => { expectHeld(await updateStaffPermissionsAction(records.staffId, { "staff.manage": true } as never)); });
it("generic deactivateStaff also leaves the exact source snapshot untouched", async () => { expectHeld(await deactivateStaff(records.staffId)); });
it.each([true, false])("batch status active=%s cannot mutate a source draft", async active => { expectHeld(await batchCourseStatus({ kind: "staff", ids: [records.staffId], active })); });
it("per-item batch reports HOLD instead of a successful activation", async () => {
  expect(await applyCourseBatchStatus({ kind: "staff", ids: [records.staffId], active: true })).toMatchObject({ success: true, succeeded: [], failed: [{ id: records.staffId, error: expect.stringContaining("來源教師") }] });
  expect(m.staffUpdate).not.toHaveBeenCalled(); expect(m.userUpdate).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.every(call => call[0].join("").includes("SELECT pg_advisory_xact_lock"))).toBe(true);
});
it("batch checks the deterministic User identity even when the Staff ID is malformed", async () => {
  m.raw.mockResolvedValue([{ ...records.staff, id: "ordinary-id" }]);
  expectHeld(await batchCourseStatus({ kind: "staff", ids: ["ordinary-id"], active: true }));
});
