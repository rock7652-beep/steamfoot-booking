// @vitest-environment jsdom
import { act, createElement as el, Fragment, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
import { CourseSettingsPanel } from "@/app/(dashboard)/dashboard/courses/settings-panel";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { COURSE_SETTINGS_PANELS, courseSettingsPanelHref } from "@/lib/course-settings-panels";
let root: Root, host: HTMLDivElement;
function Form({ pending = false }: { pending?: boolean }) {
  const [dirty, setDirty] = useState(false);
  useSettingsPanelGuard(dirty, pending);
  return el(Fragment, null,
    el("button", { onClick: () => setDirty(true) }, "修改"), el("button", { onClick: () => setDirty(false) }, "模擬儲存成功"),
    el("a", { href: "/s/a/admin/dashboard/courses/reminders?tab=logs" }, "發送紀錄"), el("a", { href: "/s/a/admin/dashboard/courses?view=settings&section=notifications" }, "返回設定"),
    el("form", { "data-settings-panel-filter": true }, el("input", { name: "tab", defaultValue: "logs" }), el("input", { name: "search", defaultValue: "測試" }), el("button", null, "篩選")));
}
async function render(pending = false) { await act(async () => root.render(el(CourseSettingsPanel, { panel: "reminders", children: el(Form, { pending }) }))); }
async function click(label: string) { const node = [...host.querySelectorAll("button,a")].find(e => e.textContent === label) as HTMLElement; expect(node).toBeTruthy(); await act(async () => node.click()); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/s/a/admin/dashboard/courses?view=settings&section=notifications&panel=reminders&month=2026-09");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("course settings side panel", () => {
  it("maps every settings destination, preserving inner filters separately", () => {
    for (const [id, config] of Object.entries(COURSE_SETTINGS_PANELS)) {
      const url = new URL(courseSettingsPanelHref(config.href + "?page=2&tab=logs"), "https://example.com");
      expect(url.pathname).toBe("/dashboard/courses"); expect(url.searchParams.get("panel")).toBe(id); expect(url.searchParams.get("section")).toBe(config.section); expect(url.searchParams.get("panelQuery")).toBe("page=2&tab=logs");
    }
    expect(courseSettingsPanelHref("/dashboard/courses?view=customers")).toBe("/dashboard/courses?view=customers");
  });
  it("closes without losing the selected category, store prefix or background query", async () => {
    await render(); await click("關閉視窗");
    expect(m.replace).toHaveBeenCalledWith("/s/a/admin/dashboard/courses?view=settings&section=notifications&month=2026-09", { scroll: false });
  });
  it("keeps tabs and GET filters in the panel", async () => {
    await render(); await click("發送紀錄");
    const tabTarget = new URL(m.replace.mock.calls[0][0], "https://example.com");
    expect(tabTarget.searchParams.get("panel")).toBe("reminders"); expect(tabTarget.searchParams.get("panelQuery")).toBe("tab=logs"); expect(tabTarget.searchParams.get("month")).toBe("2026-09");
    m.replace.mockClear(); await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const target = new URL(m.replace.mock.calls[0][0], "https://example.com"); expect(target.pathname).toBe("/s/a/admin/dashboard/courses"); expect(new URLSearchParams(target.searchParams.get("panelQuery")!).get("search")).toBe("測試");
  });
  it("guards close, Escape, tab changes and reload while retaining the draft", async () => {
    await render(); await click("修改"); await click("關閉視窗"); expect(m.replace).not.toHaveBeenCalled(); expect(host.textContent).toContain("尚有未儲存");
    await click("繼續編輯"); await click("發送紀錄"); expect(m.replace).not.toHaveBeenCalled(); await click("繼續編輯");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(host.textContent).toContain("尚有未儲存");
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await click("捨棄修改並繼續"); expect(m.replace).toHaveBeenCalledOnce();
  });
  it("blocks dismissing a pending save and allows closing after successful save", async () => {
    await render(true); await click("關閉視窗"); expect(host.textContent).toContain("設定仍在儲存"); expect(host.textContent).not.toContain("捨棄修改並繼續"); expect(m.replace).not.toHaveBeenCalled();
    await render(false); await click("繼續編輯"); await click("修改"); await click("模擬儲存成功"); await click("返回設定"); expect(m.replace).toHaveBeenCalledOnce();
  });
  it("leaves Escape to nested editors", async () => {
    await render(); const nested = document.createElement("div"); nested.setAttribute("data-right-sheet", ""); nested.setAttribute("aria-hidden", "false"); host.querySelector('[role="dialog"]')!.append(nested);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(m.replace).not.toHaveBeenCalled();
  });
});
