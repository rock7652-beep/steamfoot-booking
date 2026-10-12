// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideAccess } from "@/lib/operation-guide-types";

const actions = vi.hoisted(() => ({
  drawer: vi.fn(), profile: vi.fn(), account: vi.fn(), saveNote: vi.fn(),
  purchase: vi.fn(), refund: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/customers",
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("@/components/operation-guide-content", () => ({ OperationGuideContent: () => null }));
vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: (props: Record<string, unknown>) => createElement("a", props),
}));
vi.mock("@/server/actions/customer",()=>({updateCustomer:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced",()=>({CustomerPanelAdvanced:()=>null}));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/spa-customer-list", () => ({ SpaCustomerList: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/add-spa-staff-button", () => ({ AddSpaStaffButton: () => null }));
vi.mock("@/server/actions/spa-customer-drawer", () => ({ getSpaCustomerDrawer: actions.drawer }));
vi.mock("@/server/actions/spa-customer-profile", () => ({
  getSpaCustomerProfile: actions.profile, saveSpaCustomerNote: actions.saveNote,
}));
vi.mock("@/server/actions/spa-commerce", () => ({
  getSpaCustomerAccount: actions.account, purchaseSpaCredit: actions.purchase, refundSpaPayment: actions.refund,
}));

import { OperationGuideShell } from "@/components/operation-guide-shell";
import { RightSheet } from "@/components/admin/right-sheet";
import { PanelReadProvider } from "@/components/operations/panel-read-cache";
import { SpaCustomerDrawerButton } from "@/app/(dashboard)/dashboard/customers/_components/spa-customer-drawer-button";
import { AccountPanel } from "@/app/(dashboard)/dashboard/customers/_components/spa-customers-workspace";

const heightVariable = "--spa-customer-header-height";
const optedInSelector = '.spa-customer-header-offset[data-right-sheet][data-presentation="side"]';
let host: HTMLDivElement;
let root: Root | null;
let headerHeight: number;
let observers: TestResizeObserver[];
let originalScrollTo: PropertyDescriptor | undefined;

class TestResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) { observers.push(this); }
  notify() { this.callback([], this as unknown as ResizeObserver); }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  headerHeight = 56;
  observers = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.hasAttribute("data-dashboard-header")
      ? Number(this.getAttribute("data-test-height") ?? headerHeight) : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: height, width: 800, height, toJSON: () => ({}) };
  });
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sheet(className = "spa-customer-header-offset", presentation: "side" | "centered" = "side") {
  const props = {
    className, presentation, open: true, onClose: vi.fn(),
    children: createElement("textarea", { "aria-label": "unsaved draft", defaultValue: "original" }),
  };
  return createElement(RightSheet, props);
}

type FixtureOptions = {
  enabled?: boolean;
  module?: GuideAccess["module"];
  spaRoot?: boolean;
  header?: boolean;
  content?: ReactNode;
};
async function renderFixture({ enabled = true, module = "spa", spaRoot = true, header = true, content = sheet() }: FixtureOptions = {}) {
  await act(async () => root!.render(createElement(OperationGuideShell, {
    enabled, access: { module, permissions: [], features: {} },
  }, createElement("div", { "data-spa-admin": String(spaRoot) },
    header ? createElement("header", { "data-dashboard-header": true }, "Dashboard") : null,
    content,
  ))));
}
function shell() { return host.querySelector<HTMLElement>("[data-operation-guide-shell]")!; }
async function notifyHeight(height: number, observer = observers[0]) {
  headerHeight = height;
  await act(async () => { observer.notify(); });
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
function offsetRule() {
  const style = host.querySelector("style")!;
  return [...style.sheet!.cssRules].find(rule =>
    rule instanceof CSSStyleRule && rule.style.getPropertyValue("top").includes(heightVariable),
  ) as CSSStyleRule;
}

const customer = {
  id: "test-spa-customer", name: "Test SPA customer", phone: "0900000000", serviceNote: "original note",
  lastVisit: null, nextVisit: null, packages: [], balance: null,
};
const permissions = {
  canSell: false, canRefund: false, canReadAccounts: false, canReadBookings: false,
  canEdit: true, canCreate: false, canBook: false, canManageStaff: false,
};
const profile = { success: true as const, customer: {...customer, updatedAt:new Date(),email:null,gender:null,birthday:null,height:null,lineName:null}, bookings: [] };

// jsdom does not lay out CSS variables. Exercise actual DOM/observer behavior and
// CSS selector matching here; viewport geometry requires separate browser acceptance.
describe("SPA customer header height observation", () => {
  it("measures initially and follows repeated asynchronous wrap/un-wrap and fractional heights without remounting a draft", async () => {
    await renderFixture();
    const container = shell();
    const header = host.querySelector("[data-dashboard-header]");
    const drawer = host.querySelector("[data-right-sheet]");
    const draft = host.querySelector("textarea")!;
    draft.value = "unsaved customer note";
    expect(container.style.getPropertyValue(heightVariable)).toBe("56px");
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledExactlyOnceWith(header);
    for (const height of [108, 56, 108.375, 56]) {
      await notifyHeight(height);
      expect(container.style.getPropertyValue(heightVariable)).toBe(`${height}px`);
      expect(shell()).toBe(container);
      expect(host.querySelector("[data-right-sheet]")).toBe(drawer);
      expect(host.querySelector("textarea")).toBe(draft);
      expect(draft.value).toBe("unsaved customer note");
    }
    expect(drawer?.getAttribute("data-presentation")).toBe("side");
    expect(document.documentElement.style.getPropertyValue(heightVariable)).toBe("");
    expect(document.body.style.getPropertyValue(heightVariable)).toBe("");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "ignores an invalid initial or subsequent height of %s and recovers on a valid observation", async invalid => {
      headerHeight = invalid;
      await renderFixture();
      expect(shell().style.getPropertyValue(heightVariable)).toBe("");
      await notifyHeight(108);
      expect(shell().style.getPropertyValue(heightVariable)).toBe("108px");
      await notifyHeight(invalid);
      expect(shell().style.getPropertyValue(heightVariable)).toBe("108px");
      await notifyHeight(56.25);
      expect(shell().style.getPropertyValue(heightVariable)).toBe("56.25px");
    },
  );

  it("disconnects and removes the property on unmount, including queued observer callbacks", async () => {
    await renderFixture();
    const container = shell();
    const observer = observers[0];
    await act(async () => root!.unmount());
    root = null;
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(container.style.getPropertyValue(heightVariable)).toBe("");
    await notifyHeight(108, observer);
    expect(container.style.getPropertyValue(heightVariable)).toBe("");
  });

  it.each([{ enabled: false }, { module: "course" as const }])(
    "cleans up when the shell leaves its active SPA scope: %j", async change => {
      await renderFixture();
      const container = shell();
      const observer = observers[0];
      await renderFixture(change);
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
      expect(container.style.getPropertyValue(heightVariable)).toBe("");
      await notifyHeight(108, observer);
      expect(container.style.getPropertyValue(heightVariable)).toBe("");
      await renderFixture();
      expect(observers).toHaveLength(2);
      expect(shell().style.getPropertyValue(heightVariable)).toBe("108px");
    },
  );

  it("uses and removes a window resize fallback when ResizeObserver is unavailable", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    await renderFixture();
    const container = shell();
    const resizeListener = addListener.mock.calls.find(([event]) => event === "resize")?.[1];
    expect(resizeListener).toBeDefined();
    expect(container.style.getPropertyValue(heightVariable)).toBe("56px");
    for (const height of [108, 56, 108.375]) {
      headerHeight = height;
      await act(async () => { window.dispatchEvent(new Event("resize")); });
      expect(container.style.getPropertyValue(heightVariable)).toBe(`${height}px`);
    }
    await act(async () => root!.unmount());
    root = null;
    expect(removeListener).toHaveBeenCalledWith("resize", resizeListener);
    expect(container.style.getPropertyValue(heightVariable)).toBe("");
    headerHeight = 200;
    window.dispatchEvent(new Event("resize"));
    expect(container.style.getPropertyValue(heightVariable)).toBe("");
    expect(observers).toHaveLength(0);
  });

  it.each([
    { module: "steamfoot" as const }, { module: "course" as const }, { enabled: false },
    { spaRoot: false }, { header: false },
  ])("does not observe or set an offset outside an enabled SPA header: %j", async options => {
    await renderFixture(options);
    expect(observers).toHaveLength(0);
    expect(shell()?.style.getPropertyValue(heightVariable) ?? "").toBe("");
  });

  it("measures only the SPA header in its own shell, ignoring a header outside it and other module headers", async () => {
    const outside = document.createElement("div");
    outside.setAttribute("data-spa-admin", "true");
    outside.innerHTML = '<header data-dashboard-header data-test-height="999"></header>';
    document.body.prepend(outside);
    await act(async () => root!.render(createElement(OperationGuideShell, {
      enabled: true, access: { module: "spa", permissions: [], features: {} },
    }, createElement("div", null,
      createElement("header", { "data-dashboard-header": true, "data-test-height": 777 }, "Other module"),
      createElement("div", { "data-spa-admin": "true" },
        createElement("header", { "data-dashboard-header": true }, "SPA header"),
      ),
    ))));
    expect(shell().style.getPropertyValue(heightVariable)).toBe("56px");
    expect(observers[0].observe.mock.calls[0][0]).toBe(host.querySelector('[data-spa-admin="true"] [data-dashboard-header]'));
    await renderFixture({ module: "course" });
    await renderFixture({ header: false });
    expect(observers).toHaveLength(1);
    expect(shell().style.getPropertyValue(heightVariable)).toBe("");
  });
});

describe("SPA customer-only sheet opt-in", () => {
  it("matches only an opted-in side sheet inside a SPA admin root and retains existing shared offsets and stacking", async () => {
    await renderFixture({ content: createElement("div", null,
      sheet(), sheet("unrelated-sheet"), sheet("spa-customer-header-offset", "centered"),
    ) });
    const rule = offsetRule();
    const drawers = [...host.querySelectorAll<HTMLElement>("[data-right-sheet]")];
    expect(rule).toBeDefined();
    expect(rule.style.getPropertyValue("top")).toBe("var(--spa-customer-header-height, 3.5rem)");
    expect(drawers.map(drawer => drawer.matches(rule.selectorText))).toEqual([true, false, false]);
    expect(drawers[0].classList.contains("z-50")).toBe(true);
    expect(drawers[1].classList.contains("z-50")).toBe(true);
    expect(drawers[2].classList.contains("z-[80]")).toBe(true);
    expect(drawers[2].style.top).toBe("0px");
    const rules = [...host.querySelector("style")!.sheet!.cssRules].filter(
      (entry): entry is CSSStyleRule => entry instanceof CSSStyleRule,
    );
    expect(rules.find(entry => entry.selectorText === "[data-operation-guide-shell] [data-right-sheet]")?.style.top).toBe("3.5rem");
    expect(rules.find(entry => entry.selectorText === "[data-operation-guide-shell] [data-dashboard-header]")?.style.getPropertyValue("z-index")).toBe("60");
    expect(rules.find(entry => entry.selectorText === "[data-operation-guide-shell] [data-dashboard-navigation-overlay]")?.style.getPropertyValue("z-index")).toBe("70");
    host.querySelector("[data-spa-admin]")!.setAttribute("data-spa-admin", "false");
    expect(drawers.some(drawer => drawer.matches(rule.selectorText))).toBe(false);
  });

  it("opts in the real loading sheet and loaded AccountPanel when customer details arrive asynchronously", async () => {
    let resolve!: (value: unknown) => void;
    actions.drawer.mockReturnValue(new Promise(value => { resolve = value; }));
    await renderFixture({ content: createElement(PanelReadProvider, null,
      createElement(SpaCustomerDrawerButton, { customerId: customer.id }),
    ) });
    await click("查看顧客");
    expect(actions.drawer).toHaveBeenCalledExactlyOnceWith(customer.id);
    expect(host.querySelectorAll(optedInSelector)).toHaveLength(1);
    expect(host.querySelector('[aria-labelledby="spa-customer-loading-title"]')).toBe(host.querySelector(optedInSelector)?.querySelector("aside"));
    expect(host.textContent).toContain("讀取顧客資料中");
    await notifyHeight(108);
    await act(async () => resolve({ success: true, customer, permissions, profile }));
    expect(host.querySelectorAll(optedInSelector)).toHaveLength(1);
    expect(host.querySelector('[aria-labelledby="spa-account-title"]')).toBe(host.querySelector(optedInSelector)?.querySelector("aside"));
    expect(host.querySelector("#spa-customer-loading-title")).toBeNull();
    expect(host.querySelector("#spa-account-title")?.textContent).toContain(customer.name);
    expect(shell().style.getPropertyValue(heightVariable)).toBe("108px");
    await click("關閉");
    expect(host.querySelector("[data-right-sheet]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the real loaded customer note editor and its unsaved draft through header height changes", async () => {
    await renderFixture({ content: createElement(AccountPanel, {
      customer, permissions, profileRequest: Promise.resolve(profile), onChanged: vi.fn(), onClose: vi.fn(),
    }) });
    expect(host.querySelectorAll(optedInSelector)).toHaveLength(1);
    await click("編輯");
    const draft = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="店內備註"]')!;
    expect(draft).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      valueSetter.call(draft, "unsaved SPA draft");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    draft.focus();
    draft.setSelectionRange(3, 8);
    const panel = host.querySelector("[data-right-sheet]");
    for (const height of [108, 56, 108.375]) {
      await notifyHeight(height);
      expect(host.querySelector("[data-right-sheet]")).toBe(panel);
      expect(host.querySelector("textarea")).toBe(draft);
      expect(draft.value).toBe("unsaved SPA draft");
      expect(document.activeElement).toBe(draft);
      expect([draft.selectionStart, draft.selectionEnd]).toEqual([3, 8]);
      expect(shell().style.getPropertyValue(heightVariable)).toBe(`${height}px`);
    }
    expect(actions.saveNote).not.toHaveBeenCalled();
    expect(actions.purchase).not.toHaveBeenCalled();
    expect(actions.refund).not.toHaveBeenCalled();
    expect(actions.refresh).not.toHaveBeenCalled();
  });
});
