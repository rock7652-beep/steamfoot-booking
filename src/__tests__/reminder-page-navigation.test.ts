// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ feature: vi.fn(), workOrder: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ role: "OWNER", staffId: "s" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: async () => true }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store-a" }));
vi.mock("@/lib/store-plan", () => ({ getCurrentStorePlan: async () => "BASIC" }));
vi.mock("@/server/queries/store-feature-presentations", () => ({ isStoreFeatureEnabledForRead: m.feature }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: () => true }));
vi.mock("@/lib/db", () => ({ prisma: { trialCareSetting: { findUnique: async () => null }, trialCareLog: { findMany: async () => [] }, store: { findUniqueOrThrow: async () => ({ name: "店家", shopConfig: null }) } } }));
vi.mock("next/navigation", () => ({ redirect: () => { throw Error("REDIRECT"); } }));
vi.mock("@/components/desktop", () => ({ PageShell: ({ children }: { children: ReactNode }) => createElement("main", null, children), PageHeader: () => null }));
vi.mock("@/components/feature-gate", () => ({ FeatureGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/server/actions/work-order-notification", () => ({ getWorkOrderNotificationEnabled: m.workOrder }));
vi.mock("@/server/actions/line-quota-notifications", () => ({ getLineQuotaNotificationSetting: m.quota }));
vi.mock("@/server/actions/store-line-notification-recipients", () => ({ listStoreLineNotificationRecipients: async () => [] }));
vi.mock("@/server/actions/line-official-accounts", () => ({ getCurrentLineOfficialAccountStatus: async () => null }));
vi.mock("@/server/queries/notification-center", () => ({ listNotificationCenterLogs: async () => ({}) }));
vi.mock("@/server/queries/reminder", () => ({ getStoreReminderState: async () => ({}), getTodayCronRunStatus: async () => null, getSessionBalanceNotificationSetting: async () => ({}), getPackageLineCardReminderSetting: async () => "", getTrialLineCardReminderSetting: async () => ({ body: "", mapUrl: "" }), getPlanExpiryReminderEnabled: async () => false }));
vi.mock("@/app/(dashboard)/dashboard/reminders/line-quota-email-setting", () => ({ LineQuotaEmailSetting: () => createElement("section", { "aria-label": "LINE 額度 Email 通知" }, "LINE 額度 Email 通知") }));
vi.mock("@/app/(dashboard)/dashboard/reminders/line-notification-recipients-card", () => ({ LineNotificationRecipientsCard: () => createElement("section", null, "通知人員") }));
vi.mock("@/app/(dashboard)/dashboard/reminders/reminder-tabs", () => ({ ReminderTabs: ({ active }: { active: string }) => createElement("nav", null, active) }));
vi.mock("@/app/(dashboard)/dashboard/reminders/reminder-section-picker", () => ({ ReminderSectionPicker: ({ sections }: { sections: { key: string; label: string; content: ReactNode }[] }) => createElement("div", null, sections.map(section => createElement("div", { key: section.key, "data-category": section.key }, section.label, section.content))) }));
vi.mock("@/components/admin/work-order-notification-setting", () => ({ WorkOrderNotificationSetting: () => createElement("section", { "aria-label": "工單取件提醒" }, "工單取件提醒") }));
vi.mock("@/app/(dashboard)/dashboard/reminders/trial-care-card", () => ({ TrialCareCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/cron-run-banner", () => ({ CronRunBanner: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/store-line-health-card", () => ({ StoreLineHealthCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/simple-session-balance-reminders", () => ({ SimpleSessionBalanceReminders: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/package-line-card-reminder-setting-card", () => ({ PackageLineCardReminderSettingCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/trial-line-card-reminder-setting-card", () => ({ TrialLineCardReminderSettingCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/plan-expiry-reminder-setting-card", () => ({ PlanExpiryReminderSettingCard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/reminders/notification-log-list", () => ({ NotificationLogList: () => createElement("section", null, "紀錄") }));
import Page from "@/app/(dashboard)/dashboard/reminders/page";
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); m.feature.mockResolvedValue(true); m.quota.mockResolvedValue({ recipients: ["owner@example.invalid"] }); m.workOrder.mockResolvedValue(false); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("keeps exactly one email card on manager and none on customer/logs across repeated page reconciliation", async () => {
 const errors = vi.spyOn(console, "error").mockImplementation(() => {});
 try { for (const tab of ["manager", "customer", "manager", "logs", "manager", "customer", "manager", "customer"]) {
  const page = await Page({ searchParams: Promise.resolve({ tab }) }); await act(async () => root.render(page));
  expect(host.querySelectorAll('[aria-label="LINE 額度 Email 通知"]').length, `tab=${tab}`).toBe(tab === "manager" ? 1 : 0);
 }
 expect(errors.mock.calls.filter(call => call.some(value => String(value).includes("same key")))).toHaveLength(0);
 } finally { errors.mockRestore(); }
});

it.each([false, true])("shows and reads work-order reminders only with an active entitlement: %s", async enabled => {
 m.feature.mockImplementation(async (_store: string, feature: string) => feature !== "work_orders" || enabled);
 const page = await Page({ searchParams: Promise.resolve({ tab: "customer", section: "work-orders" }) });
 await act(async () => root.render(page));
 expect(host.querySelectorAll('[data-category="work-orders"]')).toHaveLength(enabled ? 1 : 0);
 expect(m.workOrder).toHaveBeenCalledTimes(enabled ? 1 : 0);
});
