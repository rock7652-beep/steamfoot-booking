// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement as h, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: vi.fn(),
  industry: vi.fn(),
  activeStore: vi.fn(),
  permission: vi.fn(),
  plan: vi.fn(),
  config: vi.fn(),
  hours: vi.fn(),
  trial: vi.fn(),
  rules: vi.fn(),
  store: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.activeStore }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store-plan", () => ({ getCurrentStorePlan: m.plan }));
vi.mock("@/lib/shop-config", () => ({ getTrialSettings: m.trial }));
vi.mock("@/lib/query-cache", () => ({ getCachedShopConfig: m.config, getCachedBusinessHours: m.hours }));
vi.mock("@/server/queries/reminder", () => ({ listReminderRules: m.rules }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store } } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/s/test-store/admin/dashboard/settings",
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("@/components/app-link", () => ({
  AppLink: ({ children, ...props }: ComponentProps<"a">) => h("a", props, children),
}));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSettings: () => null }));
vi.mock("@/components/desktop", () => ({
  PageShell: ({ children }: { children: ReactNode }) => h("main", null, children),
  PageHeader: () => null,
}));
vi.mock("@/components/settings", async () => {
  const { SettingsListRow } = await import("@/components/settings/settings-workspace");
  return {
    SettingsListRow,
    // Category navigation is covered separately; render the page's actual notification entries.
    SettingsModuleWorkspace: ({ sections }: { sections: Array<{ id: string; content: ReactNode }> }) =>
      h("div", null, sections.find(section => section.id === "notifications")?.content),
    SettingsPanel: ({ children }: { children: ReactNode }) => h("div", null, children),
  };
});
vi.mock("@/app/(dashboard)/dashboard/reminders/page", () => ({ default: () => null }));

import SettingsIndexPage from "@/app/(dashboard)/dashboard/settings/page";
import { FeaturePresentationProvider, type FeaturePresentationMap } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";

const entries = [
  { title: "提醒管理", href: "/settings?section=notifications&panel=reminders&panelQuery=tab%3Dcustomer" },
  { title: "推薦分享", href: "/settings/referral-share" },
  { title: "數位管家", href: "/settings/digital-butler" },
  { title: "數位管家名單", href: "/digital-butler/leads" },
];
const featureStates = (state: FeaturePresentationState): FeaturePresentationMap => ({
  [FEATURES.LINE_REMINDER]: state,
  [FEATURES.REFERRAL_SHARE]: state,
  [FEATURES.DIGITAL_BUTLER]: state,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ role: "OWNER", staffId: "staff-1" });
  m.industry.mockResolvedValue("steam");
  m.activeStore.mockResolvedValue("store-1");
  m.permission.mockResolvedValue(true);
  m.plan.mockResolvedValue("EXPERIENCE");
  m.config.mockResolvedValue({ dutySchedulingEnabled: false, bankAccountNumber: null, referralShareTemplate: null });
  m.hours.mockResolvedValue([]);
  m.trial.mockResolvedValue(null);
  m.rules.mockResolvedValue([{ isEnabled: true }]);
  m.store.mockResolvedValue({ name: "測試店", slug: "test-store" });
});

async function renderEntries(states = featureStates("ENABLED")) {
  const page = await SettingsIndexPage({ searchParams: Promise.resolve({ section: "notifications" }) });
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(h(FeaturePresentationProvider, { states, children: page }));
  return host;
}

describe.each(["steam", "spa"])("%s nested settings feature presentation", industry => {
  it.each(["HIDDEN", "LOCKED", "ENABLED"] as const)("renders %s entries without an authorization shortcut", async state => {
    m.industry.mockResolvedValue(industry);
    const host = await renderEntries(featureStates(state));

    for (const { title, href } of entries) {
      const link = host.querySelector(`a[aria-label="開啟${title}"]`);
      if (state === "ENABLED") {
        expect(link?.getAttribute("href")).toBe(`/s/test-store/admin/dashboard${href}`);
      } else {
        expect(link).toBeNull();
        expect(host.querySelector(`a[href*="${href.split("?")[0]}"]`)).toBeNull();
      }
      if (state === "HIDDEN") expect(host.textContent).not.toContain(title);
      if (state === "LOCKED") expect(host.textContent).toContain(title);
    }
    if (state === "LOCKED") {
      expect(host.textContent?.match(/未開通/g)).toHaveLength(4);
      expect(host.querySelector("a, button, input, select")).toBeNull();
    }
    if (state === "ENABLED") expect(host.textContent).toContain("1 / 1 規則開啟");
  });

  it("resolves each feature independently", async () => {
    m.industry.mockResolvedValue(industry);
    const host = await renderEntries({
      [FEATURES.LINE_REMINDER]: "HIDDEN",
      [FEATURES.REFERRAL_SHARE]: "LOCKED",
      [FEATURES.DIGITAL_BUTLER]: "ENABLED",
    });
    expect(host.textContent).not.toContain("提醒管理");
    expect(host.textContent).toContain("推薦分享未開通");
    expect(host.querySelector('a[aria-label="開啟推薦分享"]')).toBeNull();
    expect(host.querySelectorAll("a")).toHaveLength(2);
  });
});

describe("nested entries retain the destination role policy", () => {
  it.each(["HIDDEN", "LOCKED"] as const)("does not bypass %s in the HQ store view", async state => {
    m.user.mockResolvedValue({ role: "ADMIN", staffId: null });
    const host = await renderEntries(featureStates(state));
    expect(host.querySelector("a")).toBeNull();
    for (const { title } of entries) {
      if (state === "HIDDEN") expect(host.textContent).not.toContain(title);
      else expect(host.textContent).toContain(title);
    }
  });

  it.each(["MANAGER", "STAFF", "PARTNER"])("does not grant %s access through an enabled or locked feature", async role => {
    m.user.mockResolvedValue({ role, staffId: "staff-1" });
    m.permission.mockResolvedValue(false);
    for (const state of ["ENABLED", "LOCKED"] as const) {
      const host = await renderEntries(featureStates(state));
      for (const { title } of entries) expect(host.textContent).not.toContain(title);
    }
    for (const permission of ["business_hours.manage", "plans.edit", "customer.read"]) {
      expect(m.permission).toHaveBeenCalledWith(role, "staff-1", permission);
    }
  });

  it.each([
    ["business_hours.manage", ["提醒管理"]],
    ["plans.edit", ["推薦分享", "數位管家"]],
    ["customer.read", ["數位管家名單"]],
  ])("uses %s independently of other permissions", async (permission, titles) => {
    m.user.mockResolvedValue({ role: "STAFF", staffId: "staff-1" });
    m.permission.mockImplementation(async (_role, _staffId, requested) => requested === permission);
    const host = await renderEntries();
    expect([...host.querySelectorAll("a")].map(link => link.getAttribute("aria-label")))
      .toEqual(titles.map(title => `開啟${title}`));
  });

  it("keeps unsupported roles outside the settings page", async () => {
    m.user.mockResolvedValue({ role: "CUSTOMER", staffId: null });
    await expect(renderEntries()).rejects.toThrow("NOT_FOUND");
    expect(m.activeStore).not.toHaveBeenCalled();
  });

  it("leaves course settings on their existing route", async () => {
    m.industry.mockResolvedValue("course");
    await expect(renderEntries()).rejects.toThrow("REDIRECT:/dashboard/courses?view=settings");
    expect(m.rules).not.toHaveBeenCalled();
  });

  it("retains role and feature checks at the protected destination pages", () => {
    const read = (path: string) => readFileSync(`src/app/(dashboard)/dashboard/${path}/page.tsx`, "utf8");
    const reminders = read("reminders");
    expect(reminders).toContain('checkPermission(user.role, user.staffId, "business_hours.manage")');
    expect(reminders).toContain("hasStoreFeature(storeId, FEATURES.LINE_REMINDER)");
    const referral = read("settings/referral-share");
    expect(referral).toContain('checkPermission(user.role, user.staffId, "plans.edit")');
    expect(referral).toContain("hasStoreFeature(storeId, FEATURES.REFERRAL_SHARE)");
    const butler = read("settings/digital-butler");
    expect(butler).toContain('checkPermission(user.role, user.staffId, "plans.edit")');
    expect(butler).toContain("requireDigitalButlerEntitlement(storeId)");
    const leads = read("digital-butler/leads");
    expect(leads).toContain('checkPermission(user.role, user.staffId, "customer.read")');
    expect(leads).toContain("requireDigitalButlerEntitlement(storeId)");
  });
});
