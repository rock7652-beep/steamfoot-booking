import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), staff: vi.fn(), customer: vi.fn(), steam: vi.fn(), course: vi.fn(), config: vi.fn(), session: vi.fn(), activeStore: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/session", () => ({ requireAdminSession: vi.fn(), requireStaffSession: m.session }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.activeStore }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "course" }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: m.store }, staff: { count: m.staff }, customer: { count: m.customer },
  booking: { count: m.steam }, shopConfig: { findUnique: m.config },
} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { count: m.course } } }));
import { getStoreUsage } from "@/server/queries/usage";
import { getCurrentStoreLimits, getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { checkCustomerLimitOrThrow, checkMonthlyBookingLimitOrThrow, checkStaffLimitOrThrow, checkReminderSendLimit, checkReportLimit } from "@/lib/usage-gate";
import { checkBookingLimit, getTrialStatus } from "@/lib/shop-config";
import { getPlanLimits } from "@/lib/feature-flags";
import type { StorePlanFields } from "@/lib/store-plan";
const store = {
  id: "store-lubymusic", name: "Synthetic music", industryModule: "COURSE", plan: "EXPERIENCE", planStatus: "ACTIVE",
  planEffectiveAt: null, planExpiresAt: null, maxStaffOverride: null, maxCustomersOverride: null,
  maxMonthlyBookingsOverride: null, maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null,
} as const;
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T02:00:00Z"));
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/music-opening-state-20261007", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "" })) vi.stubEnv(key, value);
  m.store.mockImplementation(async ({ where }: { where: { id: string } }) => ({ ...store, id: where.id }));
  m.staff.mockResolvedValue(200); m.customer.mockResolvedValue(4); m.course.mockResolvedValue(10000); m.steam.mockResolvedValue(10000);
  m.config.mockResolvedValue({ createdAt: new Date("2026-10-07T00:00:00Z") });
  m.session.mockResolvedValue({ id: "synthetic-owner", role: "OWNER", staffId: "synthetic-staff", storeId: store.id });
  m.activeStore.mockResolvedValue(store.id);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("returns identical effective limits through authenticated and store-bound gates", async () => {
  const expected = { ...getPlanLimits(store), maxStaff: null, maxMonthlyBookings: null };
  expect(await getCurrentStoreLimits()).toEqual(expected);
  expect(await getStoreLimitsByStoreId(store.id)).toEqual(expected);
  await expect(checkStaffLimitOrThrow(10000, store.id)).resolves.toBeUndefined();
  await expect(checkMonthlyBookingLimitOrThrow(10000, store.id)).resolves.toBeUndefined();
  await expect(checkCustomerLimitOrThrow(100, store.id)).rejects.toThrow("顧客");
  expect(checkReminderSendLimit(store as StorePlanFields, 50)).toEqual({ allowed: false, current: 50, limit: 50 });
  expect(checkReportLimit(store as StorePlanFields, 1)).toEqual({ allowed: false, current: 1, limit: 0 });
});
it("does not bypass the current-store session requirement", async () => {
  m.session.mockRejectedValue(new Error("Synthetic sign-in required"));
  await expect(getCurrentStoreLimits()).rejects.toThrow("Synthetic sign-in required");
});
it("keeps original limits on the other store and production main", async () => {
  await expect(checkStaffLimitOrThrow(3, "other-store")).rejects.toThrow("最多 3 位");
  await expect(checkMonthlyBookingLimitOrThrow(100, "other-store")).rejects.toThrow("最多 100 筆");
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
  await expect(checkStaffLimitOrThrow(3, store.id)).rejects.toThrow("最多 3 位");
  await expect(checkMonthlyBookingLimitOrThrow(100, store.id)).rejects.toThrow("最多 100 筆");
});
it("existing usage UI data shows null/unlimited for only the two requested quotas", async () => {
  const usage = await getStoreUsage(store.id);
  expect(usage).toMatchObject({ plan: "EXPERIENCE", planStatus: "ACTIVE", planEffectiveAt: null, planExpiresAt: null });
  expect(usage?.metrics).toEqual([
    { label: "可啟用人員", current: 200, limit: null, pct: 0, status: "unlimited" },
    { label: "顧客數", current: 4, limit: 100, pct: 4, status: "normal" },
    { label: "本月預約", current: 10000, limit: null, pct: 0, status: "unlimited" },
  ]);
  expect(usage?.limits).toEqual(await getStoreLimitsByStoreId(store.id));
  expect(m.course).toHaveBeenCalledWith({ where: { storeId: store.id, createdAt: { gte: new Date("2026-09-30T16:00:00Z"), lte: new Date("2026-10-31T15:59:59.999Z") } } });
  expect(m.steam).not.toHaveBeenCalled();
  const other = await getStoreUsage("other-store");
  expect(other?.metrics[0]).toMatchObject({ limit: 3, status: "danger" });
  expect(other?.metrics[2]).toMatchObject({ limit: 100, status: "danger" });
});
it("trial hints and legacy booking checks agree without relaxing dates or customer quotas", async () => {
  const status = await getTrialStatus(store.id);
  expect(status).toMatchObject({ staff: { limit: Infinity }, bookings: { limit: Infinity, pct: 0 }, customers: { limit: 100 }, canCreateBooking: true });
  expect(await checkBookingLimit(store.id)).toEqual({ allowed: true, current: 10000, limit: Infinity });
  expect(await checkBookingLimit("other-store")).toEqual({ allowed: false, current: 10000, limit: 100 });
  m.config.mockResolvedValue({ createdAt: new Date("2026-08-01T00:00:00Z") });
  expect(await getTrialStatus(store.id)).toMatchObject({ trialExpired: true, canCreateBooking: false });
  expect(await checkBookingLimit(store.id)).toEqual({ allowed: false, current: 0, limit: 0 });
});
it("dated trial hints use the effective quotas and retain expiration", async () => {
  const trial = { ...store, planStatus: "TRIAL", planEffectiveAt: new Date("2026-10-01"), planExpiresAt: new Date("2026-10-30") };
  m.store.mockResolvedValue(trial);
  expect(await getTrialStatus(store.id)).toMatchObject({ staff: { limit: Infinity }, bookings: { limit: Infinity }, customers: { limit: 100 }, canCreateBooking: true });
  m.store.mockResolvedValue({ ...trial, planStatus: "EXPIRED" });
  expect(await getTrialStatus(store.id)).toMatchObject({ trialExpired: true, canCreateBooking: false });
});
