import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), access: vi.fn(), feature: vi.fn(), music: vi.fn(), reminder: vi.fn(), expiry: vi.fn(), plans: vi.fn(), care: vi.fn(), store: vi.fn(), logs: vi.fn(), map: vi.fn(), templates: vi.fn(), teachers: vi.fn(), coachLogs: vi.fn(), binding: vi.fn(), recipients: vi.fn(), notificationLogs: vi.fn(), health: vi.fn(), blocked: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.access }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: m.blocked }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findFirst: m.music }, trialCareSetting: { findUnique: m.care }, store: { findUniqueOrThrow: m.store }, trialCareLog: { findMany: m.logs }, shopConfig: { findUnique: m.map }, messageTemplate: { findMany: m.templates }, staff: { findMany: m.teachers }, $queryRaw: m.coachLogs } }));
vi.mock("@/server/actions/course-reminders", () => ({ getCourseReminderSetting: m.reminder, getCourseExpiryReminderSetting: m.expiry }));
vi.mock("@/server/actions/course-plan-reminders", () => ({ getCoursePlanReminderSettings: m.plans }));
vi.mock("@/server/actions/store-line-notification-recipients", () => ({ listStoreLineNotificationRecipients: m.recipients }));
vi.mock("@/server/queries/notification-center", () => ({ listNotificationCenterLogs: m.notificationLogs }));
vi.mock("@/server/actions/line-official-accounts", () => ({ getCurrentLineOfficialAccountStatus: m.health }));
vi.mock("@/server/services/course-coach-notifications", () => ({ coachBindingStatus: m.binding }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/trial-care-card", () => ({ TrialCareCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/reminders/coach-notification-settings", () => ({ CoachNotificationSettings: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/reminders/low-balance-settings", () => ({ CourseLowBalanceSettings: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/line-notification-recipients-card", () => ({ LineNotificationRecipientsCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/plan-expiry-reminder-setting-card", () => ({ PlanExpiryReminderSettingCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/package-line-card-reminder-setting-card", () => ({ PackageLineCardReminderSettingCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/reminder-tabs", () => ({ ReminderTabs: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/notification-log-list", () => ({ NotificationLogList: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/store-line-health-card", () => ({ StoreLineHealthCard: () => null }));
import Page from "@/app/(dashboard)/dashboard/courses/reminders/page";

beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ role: "OWNER", staffId: "staff-a" });
  m.permission.mockResolvedValue(true); m.access.mockResolvedValue({ storeId: "store-a" }); m.feature.mockResolvedValue(true); m.blocked.mockReturnValue(true);
  m.music.mockResolvedValue(null); m.reminder.mockResolvedValue({ body: "提醒", enabled: false }); m.expiry.mockResolvedValue({ enabled: false }); m.plans.mockResolvedValue([]);
  m.care.mockResolvedValue(null); m.store.mockResolvedValue({ name: "合成店" }); m.logs.mockResolvedValue([]); m.map.mockResolvedValue(null);
  m.templates.mockResolvedValue([]); m.teachers.mockResolvedValue([]); m.coachLogs.mockResolvedValue([]); m.recipients.mockResolvedValue([]); m.notificationLogs.mockResolvedValue({});
  m.health.mockResolvedValue({ status: "NOT_CONFIGURED" });
});
const customerReaders = () => [m.reminder, m.expiry, m.plans, m.care, m.store, m.logs, m.map];
it("starts independent customer reads before any setting finishes", async () => {
  let finish!: (value: { body: string; enabled: boolean }) => void;
  m.reminder.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const result = Page({ searchParams: Promise.resolve({ tab: "customer" }) });
  await vi.waitFor(() => { for (const read of customerReaders()) expect(read).toHaveBeenCalledOnce(); });
  expect(m.health).not.toHaveBeenCalled();
  finish({ body: "提醒", enabled: false }); await result;
  expect(m.care).toHaveBeenCalledWith({ where: { storeId: "store-a" } });
});
it.each(["manager", "logs", "coach"])("loads only %s data, not unrelated customer data", async tab => {
  await Page({ searchParams: Promise.resolve({ tab }) });
  for (const read of customerReaders()) expect(read).not.toHaveBeenCalled();
  expect(m.recipients).toHaveBeenCalledTimes(tab === "manager" ? 1 : 0);
  expect(m.notificationLogs).toHaveBeenCalledTimes(tab === "logs" ? 1 : 0);
  expect(m.templates).toHaveBeenCalledTimes(tab === "coach" ? 1 : 0);
});
it("does not load tab data or external health when the feature is disabled", async () => {
  m.feature.mockResolvedValue(false);
  await Page({ searchParams: Promise.resolve({ tab: "customer" }) });
  for (const read of [...customerReaders(), m.health, m.recipients, m.notificationLogs, m.templates]) expect(read).not.toHaveBeenCalled();
});
it("rejects permission before reading feature or customer data", async () => {
  m.permission.mockResolvedValue(false);
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  expect(m.access).not.toHaveBeenCalled(); expect(m.feature).not.toHaveBeenCalled();
  for (const read of customerReaders()) expect(read).not.toHaveBeenCalled();
});
it("starts production health and recipient reads concurrently", async () => {
  m.blocked.mockReturnValue(false);
  let finish!: (value: { status: string }) => void;
  m.health.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const result = Page({ searchParams: Promise.resolve({ tab: "manager" }) });
  await vi.waitFor(() => { expect(m.health).toHaveBeenCalledOnce(); expect(m.recipients).toHaveBeenCalledOnce(); });
  finish({ status: "NOT_CONFIGURED" }); await result;
});
