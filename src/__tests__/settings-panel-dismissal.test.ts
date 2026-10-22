// @vitest-environment jsdom
import { act, createElement as el, Fragment, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
import { SettingsPanel } from "@/components/settings/settings-panel";
import { CourseSettingsPanel } from "@/app/(dashboard)/dashboard/courses/settings-panel";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
let root: Root, host: HTMLDivElement;
function Form({ pending = false }: { pending?: boolean }) {
 const [value, setValue] = useState("原始內容"); useSettingsPanelGuard(value !== "原始內容", pending);
 return el(Fragment, null, el("input", { readOnly: true, value }), el("button", { onClick: () => setValue("未儲存草稿") }, "修改"));
}
function click(text: string) { const button = [...host.querySelectorAll("button")].find(node => node.textContent === text)!; expect(button).toBeTruthy(); return act(async () => button.click()); }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe.each(["steam", "course"])("%s immediate panel dismissal", kind => {
 const original = kind === "steam" ? "/hq/dashboard/settings?section=notifications&panel=reminders&panelQuery=tab%3Dmanager&month=2026-10" : "/s/a/admin/dashboard/courses?view=settings&section=notifications&panel=reminders&panelQuery=tab%3Dmanager&month=2026-10";
 async function render(pending = false) { await act(async () => root.render(kind === "steam" ? el(SettingsPanel, { title: "提醒管理", sourceHref: "/dashboard/reminders", children: el(Form, { pending }) }) : el(CourseSettingsPanel, { panel: "reminders", children: el(Form, { pending }) }))); }
 it("closes immediately without a server navigation and preserves the background URL", async () => {
  window.history.replaceState(null, "", original); const overflow = document.body.style.overflow; await render();
  expect(document.body.style.overflow).toBe("hidden"); await click("關閉視窗");
  expect(host.querySelector('[data-right-sheet]')?.getAttribute("aria-hidden")).toBe("true"); expect(host.querySelector("input")).toBeNull();
  expect(m.replace).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  const params = new URLSearchParams(window.location.search); expect(params.has("panel")).toBe(false); expect(params.has("panelQuery")).toBe(false); expect(params.get("month")).toBe("2026-10"); expect(params.get("section")).toBe("notifications"); expect(document.body.style.overflow).toBe(overflow);
 });
 it("guards drafts, then discards them and reopens with a clean form", async () => {
  window.history.replaceState(null, "", original); await render(); await click("修改"); await click("關閉視窗");
  expect(host.textContent).toContain("尚有未儲存"); expect(host.querySelector("input")?.value).toBe("未儲存草稿");
  await click("不儲存並關閉"); expect(host.querySelector("input")).toBeNull();
  window.history.replaceState(null, "", original); await render(); expect(host.querySelector("input")?.value).toBe("原始內容"); expect(host.querySelector('[data-right-sheet]')?.getAttribute("aria-hidden")).toBe("false");
 });
 it("retains pending-save protection", async () => {
  window.history.replaceState(null, "", original); await render(true); await click("關閉視窗"); expect(host.textContent).toContain("設定仍在儲存"); expect(host.querySelector('[data-right-sheet]')?.getAttribute("aria-hidden")).toBe("false"); expect(new URLSearchParams(window.location.search).has("panel")).toBe(true);
 });
});
