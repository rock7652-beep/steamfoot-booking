import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ config: vi.fn(), store: vi.fn(), feature: vi.fn(), view: vi.fn(), usage: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ role: "OWNER", staffId: "staff" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: async () => true }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "a" }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "course" }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store }, shopConfig: { findUnique: m.config } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBookingRule: { findUnique: async () => null } } }));
vi.mock("@/server/queries/usage", () => ({ getStoreUsage: m.usage }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/shop-config", () => ({ DEFAULT_BOOKABLE_DAYS_AHEAD: 14, TRIAL_DEFAULTS: { trialEnabled: true, trialDefaultPrice: 499 } }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-workspace", () => ({ CourseSettingsWorkspace: () => null }));
import { CourseSharedHub } from "@/app/(dashboard)/dashboard/courses/shared-hub";
import { FEATURES } from "@/lib/feature-flags";
async function props() { return (await CourseSharedHub({ view: "settings" })).props.children[1].props.children.props; }
beforeEach(() => {
  vi.resetAllMocks(); m.config.mockResolvedValue(null); m.store.mockResolvedValue({ name: "A", plan: "GROWTH", currentSubscription: null, subscriptions: [] }); m.feature.mockResolvedValue(false); m.view.mockResolvedValue(null); m.usage.mockResolvedValue({ metrics: [] });
});
describe("course settings server summaries", () => {
  it("uses central defaults without inventing an inactive trial or fake subscription", async () => {
    const p = await props(); expect(p.trialEnabled).toBe(true); expect(p.trialPrice).toBe(499); expect(p.bookingWindowDays).toBe(14); expect(p.subscriptionSummary).toContain("尚無訂閱紀錄"); expect(p.canDigitalButler).toBe(false); expect(p.canReferralShare).toBe(false); expect(p.canReminders).toBe(false); expect(p.canCare).toBe(false); expect(p.canUnassignedPlans).toBe(true);
  });
  it("normalizes Decimal prices, preserves explicit false and honors feature entitlements", async () => {
    m.config.mockResolvedValue({ trialEnabled: false, trialDefaultPrice: { valueOf: () => 800 }, bookingWindowDays: 30 }); m.feature.mockImplementation(async (_id, feature) => feature === FEATURES.CUSTOMER_CARE);
    const p = await props(); expect(p.trialEnabled).toBe(false); expect(p.trialPrice).toBe(800); expect(p.bookingWindowDays).toBe(30); expect(p.canCare).toBe(true); expect(p.canDigitalButler).toBe(false);
  });
  it("does not expose writable controls in headquarters view mode", async () => {
    m.feature.mockResolvedValue(true); m.view.mockResolvedValue({ isViewMode: true });
    const p = await props(); for (const key of ["canEdit", "canPayment", "canTrial", "canDutyManage", "canDigitalButler", "canReferralShare", "canReminders"]) expect(p[key], key).toBe(false);
  });
});
