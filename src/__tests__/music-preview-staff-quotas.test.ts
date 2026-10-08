import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ manager: vi.fn(), plan: vi.fn(), staff: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn(), raw: vi.fn(), transaction: vi.fn(), feature: vi.fn(), entitlement: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.plan, getCurrentStoreForPlan: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager }));
vi.mock("@/server/services/music-finance-access", () => ({ canMusicFinance: async () => true, requireMusicFinance: async () => {}, isMusicFinanceStore: async () => true, readMusicFinanceScope: async () => null }));
vi.mock("@/lib/revalidation", () => ({ revalidateStaff: vi.fn(), revalidateStaffPermissions: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  storeFeatureEntitlement: { findUnique: m.entitlement },
  $transaction: m.transaction,
} }));
import { saveCourseStaff } from "@/server/actions/course-staff";
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const plan = { plan: "EXPERIENCE", planStatus: "ACTIVE", planEffectiveAt: null, planExpiresAt: null, maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null, maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null };
const input = { name: "Synthetic music teacher", kind: "coach", emergencyContactName: "Synthetic contact", emergencyContactPhone: "not-a-real-number", emergencyContactRelation: "synthetic", requestKey: "11111111-1111-4111-a111-111111111111" };
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/music-opening-state-20261007", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" })) vi.stubEnv(key, value);
  m.plan.mockImplementation(async (id: string) => ({ ...plan, id }));
  m.manager.mockResolvedValue({ user: { id: "synthetic-owner", role: "OWNER", staffId: "synthetic-owner-staff" }, storeId: "store-lubymusic" });
  m.entitlement.mockResolvedValue(null); m.staff.mockResolvedValue(null); m.count.mockResolvedValue(200); m.raw.mockResolvedValue([]);
  m.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({
    $queryRaw: m.raw, $executeRaw: m.raw,
    staff: { findFirst: m.staff, count: m.count, update: m.update },
    user: { create: m.create, update: vi.fn() }, staffMemberLink: { updateMany: vi.fn() },
  }));
});
afterEach(() => vi.unstubAllEnvs());
it("actual staff creation accepts more than three only in the exact music scope, retaining lock and store binding", async () => {
  expect(await saveCourseStaff(input)).toMatchObject({ success: true });
  expect(m.plan).toHaveBeenCalledWith("store-lubymusic");
  expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    role: "CUSTOMER", status: "SUSPENDED", passwordHash: null,
    staff: { create: expect.objectContaining({ storeId: "store-lubymusic", status: "ACTIVE" }) },
  }) });
  expect(m.raw.mock.calls[0][0].join("")).toContain('FROM "Store"');
  expect(m.raw.mock.calls[1][0].join("")).toContain("pg_advisory_xact_lock");
});
it("actual inactive teacher activation also uses the effective staff cap", async () => {
  m.staff.mockResolvedValue({ id: "synthetic-teacher", userId: "synthetic-user", status: "INACTIVE", courseCoachEnabled: true, courseQualifiedTemplateIds: [], courseQualificationsConfirmed: false, user: { role: "CUSTOMER", status: "SUSPENDED", name: input.name } });
  expect(await saveCourseStaff({ ...input, id: "synthetic-teacher" })).toMatchObject({ success: true });
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }));
  expect(m.create).not.toHaveBeenCalled();
});
it.each(["other-store", "production", "other-preview"])("rejects actual staff creation above native cap in %s", context => {
  if (context === "other-store") m.manager.mockResolvedValue({ user: { id: "synthetic-owner", role: "OWNER" }, storeId: "other-store" });
  if (context === "production") { vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main"); }
  if (context === "other-preview") vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feat/other");
  return saveCourseStaff(input).then(result => {
    expect(result).toMatchObject({ success: false, error: "已達方案人員額度上限" });
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
});
it("retains role permission and feature gates before writes", async () => {
  m.manager.mockResolvedValueOnce({ user: { id: "synthetic-customer", role: "CUSTOMER" }, storeId: "store-lubymusic" });
  expect(await saveCourseStaff(input)).toMatchObject({ success: false });
  m.entitlement.mockResolvedValue({ status: "LOCKED", startsAt: null, expiresAt: null });
  expect(await saveCourseStaff(input)).toMatchObject({ success: false });
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("fails closed on an invalid claimed Preview before entering a staff transaction", async () => {
  vi.stubEnv("DIRECT_URL", direct + "?host=unapproved.invalid");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await saveCourseStaff(input)).toMatchObject({ success: false });
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  expect(JSON.stringify(error.mock.calls)).not.toContain("unapproved.invalid");
  error.mockRestore();
});
