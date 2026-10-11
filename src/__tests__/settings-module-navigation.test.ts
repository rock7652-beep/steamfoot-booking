// @vitest-environment jsdom
import { act, createElement, useState, useSyncExternalStore, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => {
  const subscribe = (listener: () => void) => {
    window.addEventListener("popstate", listener);
    window.addEventListener("test:navigate", listener);
    return () => {
      window.removeEventListener("popstate", listener);
      window.removeEventListener("test:navigate", listener);
    };
  };
  return {
    usePathname: () => useSyncExternalStore(subscribe, () => location.pathname, () => location.pathname),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search, () => location.search)),
    useRouter: () => mocks.router,
  };
});
vi.mock("@/components/app-link", () => ({
  AppLink: ({ href, children, scroll, ...props }: ComponentProps<"a"> & { scroll?: boolean }) => createElement("a", {
    ...props,
    href,
    "data-scroll": scroll,
    onClick: (event: MouseEvent) => {
      // Model a normal Next Link transition; capture handlers run before this.
      event.preventDefault();
      history.pushState(null, "", href);
    },
  }, children),
}));

import { usePathname } from "next/navigation";
import { OperationScope } from "@/components/operations/operation-scope";
import { operationStateKey } from "@/lib/operation-state";
import { SettingsListRow, SettingsModuleWorkspace } from "@/components/settings/settings-workspace";
import { SettingsReturnLink, settingsWorkspaceHref } from "@/components/settings/settings-navigation";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const prefix = "/s/test-store/admin";
const base = `${prefix}/dashboard/settings`;

function Draft() {
  const [value, setValue] = useState("");
  return createElement("input", { "aria-label": "標籤草稿", value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value) });
}
function Workspace() {
  return createElement(SettingsModuleWorkspace, {
    moduleLabel: "SPA 模組", storeName: "測試店",
    sections: [
      { id: "booking", label: "營業與預約", content: createElement(SettingsListRow, { title: "營業時間", summary: "開放中", href: "/dashboard/settings/hours" }) },
      { id: "payment", label: "收款與體驗", content: createElement(SettingsListRow, { title: "銀行轉帳", summary: "已設定", href: "/dashboard/settings/payment" }) },
      { id: "notifications", label: "通知與顧客經營", content: createElement("div", null,
        createElement(Draft),
        createElement(SettingsListRow, { title: "提醒管理", summary: "開啟", href: "/dashboard/settings?panel=reminders&panelQuery=tab%3Dcustomer" }),
        createElement(SettingsListRow, { title: "推薦分享", summary: "預設", href: "/dashboard/settings/referral-share" }),
      ) },
    ],
  });
}
function App({ scope = "account:store:spa" }: { scope?: string }) {
  const pathname = usePathname();
  const child = pathname !== base;
  return createElement(OperationScope, { key: scope, scope }, child
    ? createElement(SettingsReturnLink, { href: "/dashboard/settings?section=payment" } as ComponentProps<typeof SettingsReturnLink>, "返回設定")
    : createElement(Workspace));
}
async function render(scope?: string) { await act(async () => root.render(createElement(App, { scope }))); }
async function navigate(url: string) { await act(async () => { history.pushState(null, "", url); }); }
async function click(text: string) {
  const element = [...host.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a")].find(node => node.textContent === text && !node.closest("[hidden]"));
  expect(element, text).toBeTruthy();
  await act(async () => element!.click());
}
async function traverse(direction: "back" | "forward") {
  await act(async () => {
    const changed = new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
    history[direction]();
    await changed;
  });
}
function active(label: string) { return host.querySelector(`section[aria-label="${label}"]`)?.hasAttribute("hidden") === false; }

beforeEach(() => {
  sessionStorage.clear();
  mocks.router.refresh.mockReset();
  history.replaceState(null, "", base);
  const push = history.pushState.bind(history);
  vi.spyOn(history, "pushState").mockImplementation((data, unused, url) => {
    push(data, unused, url);
    window.dispatchEvent(new Event("test:navigate"));
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Steam/SPA settings navigation", () => {
  it("uses the initial URL and falls back safely for unknown categories", async () => {
    history.replaceState(null, "", `${base}?section=payment`);
    await render();
    expect(active("收款與體驗")).toBe(true);
    await navigate(`${base}?section=unknown`);
    expect(active("營業與預約")).toBe(true);
    await navigate(`${base}?section=notifications`);
    expect(active("通知與顧客經營")).toBe(true);
  });

  it("updates category without resetting query, adding duplicate history, or remounting drafts", async () => {
    history.replaceState(null, "", `${base}?section=notifications&module=spa&storeId=store-a&tab=customer&q=hello`);
    await render();
    const input = host.querySelector<HTMLInputElement>('[aria-label="標籤草稿"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "未儲存標籤");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const before = history.length;
    await click("收款與體驗");
    expect(active("收款與體驗")).toBe(true);
    expect(new URLSearchParams(location.search).get("section")).toBe("payment");
    for (const [key, value] of [["module", "spa"], ["storeId", "store-a"], ["tab", "customer"], ["q", "hello"]]) {
      expect(new URLSearchParams(location.search).get(key)).toBe(value);
    }
    expect(history.length).toBe(before + 1);
    await click("收款與體驗");
    expect(history.length).toBe(before + 1);
    await click("通知與顧客經營");
    expect(host.querySelector('[aria-label="標籤草稿"]')).toBe(input);
    expect(input.value).toBe("未儲存標籤");
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("follows Back/Forward including a settings URL without a section", async () => {
    await render();
    await click("收款與體驗");
    await click("通知與顧客經營");
    await traverse("back");
    expect(active("收款與體驗")).toBe(true);
    await traverse("back");
    expect(active("營業與預約")).toBe(true);
    await traverse("forward");
    expect(active("收款與體驗")).toBe(true);
  });

  it("returns from a child to the exact category/tab/query and restores existing scoped scroll", async () => {
    const entry = `${base}?section=payment&tab=history&q=hello%20world&module=spa&storeId=store-a`;
    history.replaceState(null, "", entry);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 430 });
    await render();
    const childLink = host.querySelector<HTMLAnchorElement>('[aria-label="開啟銀行轉帳"]')!;
    expect(childLink.pathname).toBe(`${base}/payment`);
    expect(childLink.search).toBe("?module=spa&storeId=store-a");
    await act(async () => childLink.click());
    expect(host.querySelector("a")!.getAttribute("href")).toBe(entry);
    expect(sessionStorage.getItem(operationStateKey("account:store:spa", `position:${entry}`))).not.toBeNull();
    await click("返回設定");
    expect(location.pathname + location.search).toBe(entry);
    expect(active("收款與體驗")).toBe(true);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 430, behavior: "instant" });
  });

  it("preserves context when opening a reminder panel and leaves unrelated shared rows unchanged", async () => {
    history.replaceState(null, "", `${base}?section=notifications&module=spa&storeId=store-a&tab=customer&q=notice`);
    await render();
    const link = host.querySelector<HTMLAnchorElement>('[aria-label="開啟提醒管理"]')!;
    const query = new URLSearchParams(link.search);
    expect(query.get("section")).toBe("notifications");
    expect(query.get("tab")).toBe("customer");
    expect(query.get("q")).toBe("notice");
    expect(query.get("panelQuery")).toBe("tab=customer");
    expect(link.dataset.scroll).toBe("false");
    expect(settingsWorkspaceHref("/dashboard/courses?view=settings", "section=payment")).toBe("/dashboard/courses?view=settings");
  });

  it("does not restore a different account/store/module or redirect course returns", async () => {
    history.replaceState(null, "", `${base}?section=notifications&q=private`);
    await render();
    await navigate(`${base}/payment`);
    await render("other-account:other-store:steam");
    expect(host.querySelector("a")!.getAttribute("href")).toBe(`${base}?section=payment`);
    await act(async () => root.render(createElement(OperationScope, { scope: "account:store:spa" },
      createElement(SettingsReturnLink, { href: "/dashboard/courses?view=settings&section=booking" } as ComponentProps<typeof SettingsReturnLink>, "返回設定"))));
    expect(host.querySelector("a")!.getAttribute("href")).toBe(`${prefix}/dashboard/courses?view=settings&section=booking`);
  });

  it.each([
    ["javascript:alert(1)", Date.now()],
    ["https://example.com/dashboard/settings?section=notifications", Date.now()],
    ["//example.com/dashboard/settings?section=notifications", Date.now()],
    ["/s/another-store/admin/dashboard/settings?section=notifications", Date.now()],
    [`${base}?section=notifications`, 0],
  ])("uses a safe child fallback for an invalid, cross-store or expired retained URL (%s)", async (value, at) => {
    sessionStorage.setItem(operationStateKey("account:store:spa", "settings:location"), JSON.stringify({ at, value }));
    history.replaceState(null, "", `${base}/payment?module=spa&storeId=store-a&tab=child-only`);
    await render();
    const link = host.querySelector<HTMLAnchorElement>("a")!;
    expect(link.pathname).toBe(base);
    expect(link.search).toBe("?module=spa&storeId=store-a&section=payment");
  });

  it("keeps direct child return scope without carrying the child's tab into settings", async () => {
    history.replaceState(null, "", `${base}/payment?module=spa&storeId=store-a&tab=bank`);
    await render();
    await click("返回設定");
    expect(active("收款與體驗")).toBe(true);
    expect(location.search).toBe("?module=spa&storeId=store-a&section=payment");
  });

  it("supports the narrow-screen category selector", async () => {
    await render();
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "payment";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(active("收款與體驗")).toBe(true);
    expect(new URLSearchParams(location.search).get("section")).toBe("payment");
  });
});
