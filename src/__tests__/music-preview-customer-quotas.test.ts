import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorePlanFields } from "@/lib/store-plan";

const m = vi.hoisted(() => ({
  manager: vi.fn(), plan: vi.fn(), transaction: vi.fn(), raw: vi.fn(),
  count: vi.fn(), create: vi.fn(), refresh: vi.fn(), logError: vi.fn(),
}));

// Keep the action, validators, feature-gate and effective quota resolver real.
// Persistence and unrelated service dependencies cannot connect to a database.
vi.mock("next/cache", () => ({ revalidatePath: m.refresh, unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.plan, getCurrentStoreForPlan: vi.fn() }));
vi.mock("@/lib/error-logger", () => ({ logError: m.logError, categorizeError: () => "UNKNOWN" }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager }));
vi.mock("@/server/services/course-booking", () => ({}));
vi.mock("@/server/services/course-waitlist", () => ({}));
vi.mock("@/server/services/course-shared-card", () => ({}));
vi.mock("@/server/services/course-display-order", () => ({}));
vi.mock("@/server/services/music-subject-rule", () => ({}));
vi.mock("@/server/services/course-term", () => ({}));
vi.mock("@/server/services/course-low-balance-schedule", () => ({}));
vi.mock("@/server/services/course-assignment-checkout", () => ({}));
vi.mock("@/server/services/operation-audit-outbox", () => ({}));

import { AppError } from "@/lib/errors";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { getPlanLimits } from "@/lib/feature-flags";
import { saveCourseCustomer } from "@/server/actions/course-members";
import { MUSIC_OPENING_BRANCH, MUSIC_OPENING_STORE } from "../../scripts/music-opening-preview-scope.mjs";

// Synthetic connection strings are parsed only; no network or DB client is used.
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const previewEnv = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: MUSIC_OPENING_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
};
const input = { name: "Synthetic music learner", phone: "0900000000" };

function setup(storeId = MUSIC_OPENING_STORE) {
  const plan: StorePlanFields = {
    id: storeId, plan: "EXPERIENCE", planStatus: "ACTIVE",
    planEffectiveAt: null, planExpiresAt: null,
    maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null,
    maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null,
  };
  m.manager.mockResolvedValue({ storeId, user: { id: "synthetic-manager" } });
  m.plan.mockImplementation(async (requestedId: string) => {
    expect(requestedId).toBe(storeId);
    return plan;
  });
  m.raw.mockResolvedValue([{ id: storeId }]);
  m.count.mockResolvedValue(10000);
  m.create.mockResolvedValue({ id: "synthetic-customer" });
  m.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({
    $queryRaw: m.raw, customer: { count: m.count, create: m.create },
  }));
  return plan;
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries(previewEnv)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("music Preview student quotas through the actual customer creation action", () => {
  it("creates beyond 10,000 only in the exact music scope while retaining permission, lock and store binding", async () => {
    const plan = setup();
    expect(getPlanLimits(plan).maxCustomers).toBe(100);
    expect((await getStoreLimitsByStoreId(MUSIC_OPENING_STORE)).maxCustomers).toBeNull();

    expect(await saveCourseCustomer(input)).toEqual({ success: true, data: { id: "synthetic-customer" } });

    expect(m.manager).toHaveBeenCalledExactlyOnceWith("customer.create");
    expect(m.plan).toHaveBeenCalledTimes(2);
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.raw).toHaveBeenCalledExactlyOnceWith(expect.any(Array), MUSIC_OPENING_STORE);
    expect(m.raw.mock.calls[0][0].join("?")).toBe('SELECT id FROM "Store" WHERE id = ? FOR UPDATE');
    expect(m.count).toHaveBeenCalledExactlyOnceWith({ where: { storeId: MUSIC_OPENING_STORE, mergedIntoCustomerId: null } });
    expect(m.create).toHaveBeenCalledExactlyOnceWith({
      data: { storeId: MUSIC_OPENING_STORE, ...input, email: null, gender: null, birthday: null, height: null },
      select: { id: true },
    });
    expect(m.raw.mock.invocationCallOrder[0]).toBeLessThan(m.count.mock.invocationCallOrder[0]);
    expect(m.count.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
    expect(m.refresh.mock.calls).toEqual([["/dashboard"], ["/dashboard/courses"], ["/book"]]);
    expect(plan.maxCustomersOverride).toBeNull();
    expect(getPlanLimits(plan).maxCustomers).toBe(100);
  });

  it.each(["other store", "production main", "other Preview"])("preserves the native 100-customer boundary for %s", async context => {
    const storeId = context === "other store" ? "synthetic-other-store" : MUSIC_OPENING_STORE;
    if (context === "production main") {
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    }
    if (context === "other Preview") vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feat/synthetic-other-preview");
    setup(storeId);
    expect((await getStoreLimitsByStoreId(storeId)).maxCustomers).toBe(100);

    for (const count of [100, 10000]) {
      m.count.mockResolvedValue(count);
      expect(await saveCourseCustomer(input)).toEqual({ success: false, error: "已達方案顧客額度上限" });
      expect(m.create).not.toHaveBeenCalled();
      expect(m.refresh).not.toHaveBeenCalled();
    }
    m.count.mockResolvedValue(99);
    expect(await saveCourseCustomer(input)).toEqual({ success: true, data: { id: "synthetic-customer" } });
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.count).toHaveBeenCalledWith({ where: { storeId, mergedIntoCustomerId: null } });
  });

  it.each([
    ["VERCEL", undefined], ["VERCEL_ENV", "production"],
    ["VERCEL_GIT_REPO_OWNER", "synthetic-other-owner"], ["VERCEL_GIT_REPO_SLUG", "synthetic-other-repo"],
    ["WORKERS_CI_BRANCH", "main"], ["CF_PAGES_BRANCH", "synthetic-other-branch"],
    ["DATABASE_URL", undefined], ["DIRECT_URL", undefined],
    ["DATABASE_URL", direct + "?host=unapproved.invalid"], ["DIRECT_URL", direct + "?host=unapproved.invalid"],
  ] as const)("fails closed before the customer transaction for malformed claimed music scope: %s=%s", async (key, value) => {
    setup();
    vi.stubEnv(key, value);

    const result = await saveCourseCustomer(input);

    expect(result).toMatchObject({ success: false });
    expect(m.manager).toHaveBeenCalledExactlyOnceWith("customer.create");
    expect(m.plan).toHaveBeenCalledExactlyOnceWith(MUSIC_OPENING_STORE);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.raw).not.toHaveBeenCalled();
    expect(m.count).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("unapproved.invalid");
  });

  it("still rejects permission failures before resolving quotas or entering a transaction", async () => {
    setup();
    m.manager.mockRejectedValue(new AppError("FORBIDDEN", "不可建立學員"));

    expect(await saveCourseCustomer(input)).toEqual({ success: false, error: "不可建立學員" });

    expect(m.manager).toHaveBeenCalledExactlyOnceWith("customer.create");
    expect(m.plan).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
