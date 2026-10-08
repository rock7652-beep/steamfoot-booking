import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  musicSourceTeacherDraftRecords, musicSourceTeacherHash, musicSourceTeacherIdentity,
  planMusicSourceTeacherDraft, type MusicSourceTeacherSnapshot,
} from "@/lib/music-source-teacher-draft";

const m = vi.hoisted(() => ({ manager: vi.fn(), feature: vi.fn(), transaction: vi.fn(), raw: vi.fn(), staffFind: vi.fn(), userFind: vi.fn(), auditFind: vi.fn(), staffCreate: vi.fn(), userCreate: vi.fn(), auditCreate: vi.fn(), staffUpdate: vi.fn(), userUpdate: vi.fn(), memberUpdate: vi.fn(), kick: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseTransaction: m.kick }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature, getStoreLimitsByStoreId: async () => ({ maxStaff: null }) }));
vi.mock("@/server/services/music-finance-access", () => ({ canMusicFinance: async () => true, requireMusicFinance: async () => {}, isMusicFinanceStore: async () => true, readMusicFinanceScope: async () => null }));
vi.mock("@/lib/revalidation", () => ({ revalidateStaff: vi.fn(), revalidateStaffPermissions: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
import { stageMusicSourceTeacherDraft, assertMusicSourceTeacherDraftEditable } from "@/server/services/music-source-teacher-drafts";
import { saveCourseStaff } from "@/server/actions/course-staff";

const snapshot: MusicSourceTeacherSnapshot = {
  version: 1, marker: "SOURCE_REPLICA", targetStoreId: "store-lubymusic",
  sourceSystem: "YINJIAOYUN", sourceTenantKey: "www.injiaoyun.com:store-lubymusic", sourceTeacherId: "synthetic-teacher-001",
  sourceRevision: "synthetic-revision-001", sourceDisplayName: "Synthetic teacher",
};
function proofFor(value = snapshot) {
  return { status: "SOURCE_VERIFIED", targetStoreId: value.targetStoreId, sourceSystem: value.sourceSystem,
    sourceTenantKey: value.sourceTenantKey, sourceTeacherId: value.sourceTeacherId, sourceRevision: value.sourceRevision,
    snapshotHash: musicSourceTeacherHash(value) };
}
const empty = { staff: null, user: null, receipts: [], hasRelatedData: false };
const records = musicSourceTeacherDraftRecords(snapshot);
const existing = { staff: records.staff, user: records.user, receipts: [records.receipt], hasRelatedData: false };
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const input = { id: records.staffId, name: snapshot.sourceDisplayName, kind: "coach", requestKey: "11111111-1111-4111-a111-111111111111" };
const tx = {
  $queryRaw: m.raw, $executeRaw: vi.fn(),
  staff: { findUnique: m.staffFind, findFirst: m.staffFind, create: m.staffCreate, update: m.staffUpdate, count: async () => 0 },
  user: { findUnique: m.userFind, create: m.userCreate, update: m.userUpdate },
  auditLog: { findMany: m.auditFind, create: m.auditCreate },
  staffMemberLink: { updateMany: m.memberUpdate },
};
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/music-opening-state-20261007", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" })) vi.stubEnv(key, value);
  m.manager.mockResolvedValue({ user: { id: "synthetic-owner", role: "OWNER", staffId: "synthetic-owner-staff" }, storeId: snapshot.targetStoreId });
  m.staffFind.mockResolvedValue(null); m.userFind.mockResolvedValue(null); m.auditFind.mockResolvedValue([]);
  m.raw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "Store"')) return [{ id: snapshot.targetStoreId }];
    if (sql.includes('FROM "StoreFeatureEntitlement"')) return [{ storeId: snapshot.targetStoreId }];
    if (sql.includes('AS "hasRelatedData"')) return [{ hasRelatedData: false }];
    if (sql.includes('FROM "AuditLog"')) return [];
    return [];
  });
  m.transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
});
afterEach(() => vi.unstubAllEnvs());
function expectNoWrites() {
  for (const fn of [m.staffCreate, m.userCreate, m.auditCreate, m.staffUpdate, m.userUpdate, m.memberUpdate]) expect(fn).not.toHaveBeenCalled();
  for (const call of tx.$executeRaw.mock.calls) expect(call[0].join("?")).toContain("SELECT pg_advisory_xact_lock");
}

describe("synthetic source-replica teacher contract", () => {
  it("uses explicit stable source identity, never display name or revision", () => {
    expect(musicSourceTeacherIdentity({ ...snapshot, sourceDisplayName: "Changed synthetic name", sourceRevision: "new-revision" })).toEqual(musicSourceTeacherIdentity(snapshot));
    expect(musicSourceTeacherIdentity({ ...snapshot, sourceTeacherId: "another-source-id" })).not.toEqual(musicSourceTeacherIdentity(snapshot));
    expect(planMusicSourceTeacherDraft(snapshot, proofFor(), empty)).toMatchObject({ status: "READY", staff: { status: "INACTIVE", courseCoachEnabled: false, courseQualificationsConfirmed: false }, user: { role: "CUSTOMER", status: "SUSPENDED", passwordHash: null, email: null, phone: null } });
  });
  it.each(["email", "phone", "password", "role", "permissions", "qualificationIds", "teachingFees", "customerId"])("rejects extra %s data instead of dropping it", key => {
    expect(planMusicSourceTeacherDraft({ ...snapshot, [key]: "unauthorized" }, proofFor(), empty)).toMatchObject({ status: "HOLD" });
  });
  it("marks both isolated display names and rejects overflow without truncating the source name", () => {
    expect(records.staff.displayName).toBe("[音教雲] Synthetic teacher");
    expect(records.user.name).toBe(records.staff.displayName);
    for (const sourceDisplayName of ["S".repeat(75), "S".repeat(80)]) {
      const next = { ...snapshot, sourceDisplayName };
      expect(planMusicSourceTeacherDraft(next, proofFor(next), empty)).toMatchObject({ status: "HOLD" });
    }
    const next = { ...snapshot, sourceDisplayName: "S".repeat(74) };
    expect(planMusicSourceTeacherDraft(next, proofFor(next), empty)).toMatchObject({ status: "READY", staff: { displayName: "[音教雲] " + "S".repeat(74) } });
  });
  it("rejects other source systems and tenant aliases", () => {
    for (const changed of [{ sourceSystem: "OTHER" }, { sourceTenantKey: "other-tenant" }]) {
      expect(planMusicSourceTeacherDraft({ ...snapshot, ...changed }, proofFor(), empty)).toMatchObject({ status: "HOLD" });
    }
  });
  it("requires matching independent source/store evidence", () => {
    for (const changed of [{ snapshotHash: "a".repeat(64) }, { sourceTeacherId: "another-id" }, { sourceTenantKey: "another-tenant" }, { targetStoreId: "other-store" }, { status: "UNVERIFIED" }]) {
      expect(planMusicSourceTeacherDraft(snapshot, { ...proofFor(), ...changed }, empty)).toMatchObject({ status: "HOLD" });
    }
  });
  it("replaying an exact snapshot is a NO_OP", () => {
    expect(planMusicSourceTeacherDraft(snapshot, proofFor(), existing)).toEqual({ status: "NO_OP", staffId: records.staffId, userId: records.userId });
  });
  it("changed source snapshot remains the same target and is held", () => {
    for (const next of [{ ...snapshot, sourceRevision: "revised" }, { ...snapshot, sourceDisplayName: "Renamed synthetic teacher" }]) {
      expect(planMusicSourceTeacherDraft(next, proofFor(next), existing)).toMatchObject({ status: "HOLD", issue: "SOURCE_RECEIPT_MISSING_OR_CHANGED" });
    }
  });
  it("holds partial writes, tampered receipts, cross-store rows and any activated or linked state", () => {
    for (const state of [
      { ...existing, receipts: [] }, { ...existing, receipts: [records.receipt, records.receipt] },
      { ...existing, staff: null }, { ...existing, user: null },
      { ...existing, staff: { ...records.staff, storeId: "other-store" } },
      { ...existing, user: { ...records.user, role: "OWNER" } },
      { ...existing, staff: { ...records.staff, courseCoachEnabled: true } },
      { ...existing, user: { ...records.user, email: "synthetic@example.invalid" } },
      { ...existing, hasRelatedData: true },
      { ...existing, receipts: [{ ...records.receipt, source: "MANUAL" }] },
    ]) expect(planMusicSourceTeacherDraft(snapshot, proofFor(), state)).toMatchObject({ status: "HOLD" });
  });
});

describe("server-only controlled draft service", () => {
  it("locks and proves this store, writes only new inactive Staff/User and an exact source receipt", async () => {
    expect(await stageMusicSourceTeacherDraft(snapshot, proofFor())).toEqual({ status: "STAGED", staffId: records.staffId, userId: records.userId });
    expect(m.manager).toHaveBeenCalledWith("staff.manage");
    expect(m.raw.mock.calls[0][0].join("")).toContain('FOR UPDATE');
    expect(m.raw.mock.calls[0].slice(1)).toEqual([snapshot.targetStoreId]);
    expect(m.userCreate).toHaveBeenCalledExactlyOnceWith({ data: records.user });
    expect(m.staffCreate).toHaveBeenCalledExactlyOnceWith({ data: records.staff });
    expect(m.auditCreate).toHaveBeenCalledExactlyOnceWith({ data: { ...records.receipt, actorUserId: "synthetic-owner" } });
    expect(m.staffUpdate).not.toHaveBeenCalled(); expect(m.userUpdate).not.toHaveBeenCalled(); expect(m.kick).not.toHaveBeenCalled();
  });
  it.each([
    ["VERCEL", ""], ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"],
    ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"],
    ["DATABASE_URL", "postgresql://postgres@db.other.supabase.co/postgres"], ["DIRECT_URL", direct + "?host=other.invalid"],
    ["WORKERS_CI_BRANCH", "other"], ["CF_PAGES_BRANCH", "other"],
  ])("denies %s=%s before actor/DB access", async (key, value) => {
    vi.stubEnv(key, value);
    await expect(stageMusicSourceTeacherDraft(snapshot, proofFor())).rejects.toThrow();
    expect(m.manager).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled(); expectNoWrites();
  });
  it("denies invalid source proof before actor/DB access", async () => {
    expect(await stageMusicSourceTeacherDraft(snapshot, {})).toMatchObject({ status: "HOLD" });
    expect(m.manager).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled(); expectNoWrites();
  });
  it.each(["foreign-store", "customer-role", "permission", "feature", "store-proof", "music-proof"])("denies %s", async reason => {
    if (reason === "foreign-store") m.manager.mockResolvedValue({ user: { id: "owner", role: "OWNER" }, storeId: "other-store" });
    if (reason === "customer-role") m.manager.mockResolvedValue({ user: { id: "customer", role: "CUSTOMER" }, storeId: snapshot.targetStoreId });
    if (reason === "permission") m.manager.mockRejectedValue(new Error("Permission denied"));
    if (reason === "feature") m.feature.mockRejectedValue(new Error("Feature denied"));
    if (reason === "store-proof") m.raw.mockResolvedValue([]);
    if (reason === "music-proof") m.raw.mockImplementation(async (strings: TemplateStringsArray) => strings.join("").includes('FROM "Store"') ? [{ id: snapshot.targetStoreId }] : []);
    await expect(stageMusicSourceTeacherDraft(snapshot, proofFor())).rejects.toThrow(); expectNoWrites();
  });
  it("is idempotent without audit/notification writes", async () => {
    m.staffFind.mockResolvedValue(records.staff); m.userFind.mockResolvedValue(records.user); m.auditFind.mockResolvedValue([records.receipt]);
    expect(await stageMusicSourceTeacherDraft(snapshot, proofFor())).toMatchObject({ status: "NO_OP" });
    expectNoWrites(); expect(m.kick).not.toHaveBeenCalled();
  });
  it("holds an ordinary-row ID collision without adopting or overwriting it", async () => {
    m.staffFind.mockResolvedValue({ ...records.staff, userId: "ordinary-user", storeId: "other-store" });
    expect(await stageMusicSourceTeacherDraft(snapshot, proofFor())).toMatchObject({ status: "HOLD" }); expectNoWrites();
  });
  it("holds unexpected authentication/permission/link/fee/policy data or an unreadable proof", async () => {
    m.staffFind.mockResolvedValue(records.staff); m.userFind.mockResolvedValue(records.user); m.auditFind.mockResolvedValue([records.receipt]);
    const previous = m.raw.getMockImplementation()!;
    for (const value of [[], [{ hasRelatedData: true }]]) {
      m.raw.mockImplementation(async (strings: TemplateStringsArray, ...args: unknown[]) => strings.join("").includes('AS "hasRelatedData"') ? value : previous(strings, ...args));
      expect(await stageMusicSourceTeacherDraft(snapshot, proofFor())).toMatchObject({ status: "HOLD" }); expectNoWrites();
    }
  });
});

describe("ordinary staff action cannot activate a source draft", () => {
  it.each([
    {}, { active: false }, { coachEnabled: true }, { qualificationsConfirmed: true, qualificationIds: ["synthetic-course"] },
    { email: "synthetic@example.invalid", password: "synthetic-password" }, { permissions: ["staff.manage"] },
    { customerId: "synthetic-customer" }, { linkedStaffId: "synthetic-manager" },
    { emergencyContactName: "Synthetic contact", emergencyContactPhone: "not-a-real-number", emergencyContactRelation: "synthetic", coachEnabled: true },
  ])("holds source drafts before every write even with %j", async changes => {
    m.staffFind.mockResolvedValue({ ...records.staff, user: records.user });
    expect(await saveCourseStaff({ ...input, ...changes })).toMatchObject({ success: false, error: expect.stringContaining("來源教師") });
    expectNoWrites();
  });
  it("prevents an ordinary account from linking or syncing into a source draft before any writes", async () => {
    m.staffFind.mockImplementation(async ({ where }) => where.id === records.staffId
      ? { ...records.staff, user: records.user }
      : { id: "synthetic-manager", userId: "synthetic-manager-user", status: "ACTIVE", user: { role: "STAFF" } });
    expect(await saveCourseStaff({ ...input, id: "synthetic-manager", kind: "manager", linkedStaffId: records.staffId })).toMatchObject({ success: false, error: expect.stringContaining("來源教師") });
    expectNoWrites();
  });
  it("holds a missing/malformed source receipt using deterministic user or staff markers", async () => {
    for (const value of [{ id: records.staffId, userId: "ordinary-user" }, { id: "ordinary-staff", userId: records.userId }]) {
      await expect(assertMusicSourceTeacherDraftEditable(tx, value, "other-store")).rejects.toThrow("來源教師");
    }
  });
  it("holds source-marked records even when their IDs no longer match", async () => {
    m.raw.mockResolvedValue([{ id: records.auditId }]);
    await expect(assertMusicSourceTeacherDraftEditable(tx, { id: "ordinary-staff", userId: "ordinary-user" }, snapshot.targetStoreId)).rejects.toThrow("來源教師");
  });
  it("limits ordinary-ID receipt lookup to this teacher marker pair", async () => {
    await assertMusicSourceTeacherDraftEditable(tx, { id: "ordinary-staff", userId: "ordinary-user" }, snapshot.targetStoreId);
    const sql = m.raw.mock.calls[0][0].join("?");
    expect(sql).toContain("AND source='SOURCE_REPLICA' AND \"targetType\"=");
    expect(sql).not.toContain(" OR ");
    expect(m.raw.mock.calls[0].slice(1)).toEqual(["ordinary-staff", "MusicSourceTeacherDraft"]);
  });
  it("does not broaden ordinary settings or weaken the new music personnel contact requirement", async () => {
    expect(await saveCourseStaff({ name: "Synthetic ordinary teacher", kind: "coach", active: false, requestKey: input.requestKey })).toMatchObject({ success: false, error: "新建人員請填緊急聯絡姓名、關係與電話" });
    expect(m.transaction).not.toHaveBeenCalled(); expectNoWrites();
    await expect(assertMusicSourceTeacherDraftEditable(tx, { id: "ordinary-staff", userId: "ordinary-user" }, "other-store")).resolves.toBeUndefined();
    expect(m.raw).not.toHaveBeenCalled();
  });
});
