// @vitest-environment jsdom
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(dashboard)/dashboard/reminders/steam-reminder-view", () => ({ SteamReminderView: FixtureView }));
vi.mock("@/app/(dashboard)/dashboard/courses/reminders/course-reminder-view", () => ({ CourseReminderView: FixtureView }));
import { SettingsPanel } from "@/components/settings/settings-panel";
import { CourseSettingsPanel } from "@/app/(dashboard)/dashboard/courses/settings-panel";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { ReminderPanelReader } from "@/app/(dashboard)/dashboard/reminders/reminder-panel-reader";
import { encodeReminderPanel } from "@/lib/reminder-panel-wire";
import type { ReminderPanelData } from "@/server/queries/reminder-panel";
function FixtureView({ data }: { data: ReminderPanelData }) {
 const [dirty, setDirty] = useState(false), [expanded, setExpanded] = useState(false);
 useSettingsPanelGuard(dirty, false);
 const base = data.module === "course" ? "/dashboard/courses/reminders" : "/dashboard/reminders";
 return h("div", null, h("nav", null, ["manager", "customer", "logs"].map(tab => h("a", { key: tab, href: `${base}?tab=${tab}`, "aria-current": data.params.tab === tab ? "page" : undefined }, tab))), h("p", { "data-visible-tab": true }, data.params.tab), h("button", {onClick: () => setDirty(true)}, "修改"), h("button", {onClick: () => setExpanded(!expanded)}, expanded ? "收合" : "分類"));
}
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", m.fetch); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const click = async (text: string) => act(async () => { [...host.querySelectorAll("a,button")].find(e => e.textContent === text)!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
describe.each(["steamfoot", "course"] as const)("%s independent reminder reader", module => {
 const makeData = (tab: string, readId = "initial") => ({ module, readId, actorId: "owner-a", storeId: "store-a", params: { tab } }) as unknown as ReminderPanelData;
 async function render(readId = "initial") {
  const initial = makeData("manager", readId), child = h(ReminderPanelReader, { initial });
  await act(async () => root.render(module === "course" ? h(CourseSettingsPanel, { panel: "reminders", children: child }) : h(SettingsPanel, { title: "提醒管理", sourceHref: "/dashboard/reminders", children: child })));
 }
 function response(url: string, overrides = {}) {
  const query = new URL(url, window.location.origin).searchParams.get("query")!;
  return Response.json({ success: true, storeId: "store-a", module, query, data: encodeReminderPanel(makeData(new URLSearchParams(query).get("tab")!)), ...overrides });
 }
 beforeEach(() => { window.history.replaceState(null, "", `/s/a/admin/dashboard/${module === "course" ? "courses?view=settings&" : "settings?"}section=notifications&month=2026-10&panel=reminders&panelQuery=tab%3Dmanager`); m.fetch.mockImplementation(async url => response(url)); });
 it("uses SSR data initially, then only JSON reads and native URL updates, with no RSC navigation", async () => {
  await render(); expect(m.fetch).not.toHaveBeenCalled();
  for (const tab of ["customer", "logs", "manager"]) { await click(tab); expect(host.querySelector('[data-visible-tab]')?.textContent).toBe(tab); }
  expect(m.fetch).toHaveBeenCalledTimes(3); expect(m.replace).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  const url = new URL(m.fetch.mock.calls[0][0], window.location.origin);
  expect(url.pathname).toBe("/api/settings/reminder-panel"); expect(url.searchParams.get("expectedActorId")).toBe("owner-a"); expect(url.searchParams.get("expectedStoreId")).toBe("store-a");
  expect(new URLSearchParams(window.location.search).get("month")).toBe("2026-10");
 });
 it("keeps controls responsive and ignores an older response after a later tab wins", async () => {
  const pending: {url: string; finish: (r: Response) => void}[] = [];
  m.fetch.mockImplementation(url => new Promise<Response>(finish => pending.push({ url, finish })));
  await render(); await click("customer"); await render("late-hydration"); expect(host.querySelector('[data-panel-navigation-status]')).not.toBeNull();
  await click("分類"); expect(host.textContent).toContain("收合"); await click("logs"); expect(pending).toHaveLength(2);
  await act(async () => pending[1].finish(response(pending[1].url)));
  expect(host.querySelector('[data-visible-tab]')?.textContent).toBe("logs");
  await act(async () => pending[0].finish(response(pending[0].url)));
  expect(host.querySelector('[data-visible-tab]')?.textContent).toBe("logs");
  await render("late-server-refresh"); expect(host.querySelector('[data-visible-tab]')?.textContent).toBe("logs");
 });
 it("discards unsaved drafts without prompting and preserves the prior URL on read failure", async () => {
  await render(); await click("修改");
  m.fetch.mockResolvedValueOnce(Response.json({ success: false, error: "權限已變更" }, { status: 403 }));
  await click("logs"); expect(host.textContent).not.toContain("尚有未儲存"); expect(host.querySelector('[role=alert]')?.textContent).toContain("權限已變更"); expect(host.querySelector('[data-visible-tab]')).toBeNull();
  expect(new URLSearchParams(window.location.search).get("panelQuery")).toBe("tab=manager");
  await click("重新讀取"); expect(host.querySelector('[data-visible-tab]')?.textContent).toBe("logs");
 });
 it("rejects mismatched scope receipts and does not reuse completed responses", async () => {
  await render(); m.fetch.mockImplementationOnce(async url => response(url, { storeId: "foreign" }));
  await click("logs"); expect(host.querySelector('[data-visible-tab]')).toBeNull();
  await click("重新讀取"); await click("manager"); await click("logs"); expect(m.fetch).toHaveBeenCalledTimes(4);
 });
 it("ignores a response after closing and reinitializes from a new server revision", async () => {
  let finish!: (r: Response) => void, requestUrl = "";
  m.fetch.mockImplementationOnce(url => { requestUrl = url; return new Promise<Response>(r => { finish = r; }); });
  await render(); await click("logs"); await click("關閉視窗"); await act(async () => finish(response(requestUrl)));
  expect(new URLSearchParams(window.location.search).has("panel")).toBe(false); expect(host.querySelector('[data-visible-tab]')).toBeNull();
 });
});
