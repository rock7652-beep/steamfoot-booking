// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/server/actions/store-feature-entitlement", () => ({ saveStoreFeatureEntitlementAction: mock.save }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
import { FeatureEntitlementList } from "@/app/hq/dashboard/stores/[storeId]/features/feature-entitlement-list";
let host: HTMLDivElement, root: Root;
const rows: ComponentProps<typeof FeatureEntitlementList>["rows"] = [
  { key: "frontend_preview", label: "前台預覽", category: "營運", description: "唯讀會員畫面", baseAllowed: false, effectiveAllowed: true, statusLabel: "啟用", statusClass: "", sourceLabel: "手動開通", requiresLineSetup: false, override: "ENABLED", source: "MANUAL", startsAt: "", expiresAt: "", note: "" },
  { key: "device_preview", label: "裝置預覽", category: "營運", description: "桌機與 iPad", baseAllowed: true, effectiveAllowed: false, statusLabel: "鎖定", statusClass: "", sourceLabel: "總部覆寫", requiresLineSetup: false, override: "LOCKED", source: "HQ_OVERRIDE", startsAt: "", expiresAt: "", note: "" },
];
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(node => node.textContent === label)!;
  await act(async () => button.click());
}
async function input(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  mock.save.mockReset().mockResolvedValue({ success: "功能設定已更新", error: null });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(FeatureEntitlementList, { storeId: "a", categories: ["營運"], rows })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("HQ feature list", () => {
  it("filters independently by search and effective permission", async () => {
    await input(host.querySelector('input[placeholder]')!, "iPad");
    expect(host.querySelectorAll("h3")[1]?.textContent).toBe("裝置預覽");
    expect(host.textContent).not.toContain("前台預覽");
    const selector = [...host.querySelectorAll("select")][1];
    await act(async () => { selector.value = "enabled"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("沒有符合條件的資料");
  });
  it("preserves a draft when filtering until explicitly discarded", async () => {
    await click("修改"); await input(host.querySelector('input[name="note"]')!, "草稿");
    await input(host.querySelector('input[placeholder]')!, "裝置");
    expect(host.textContent).toContain("尚有未儲存的修改");
    await click("繼續編輯");
    expect((host.querySelector('input[name="note"]') as HTMLInputElement).value).toBe("草稿");
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await input(host.querySelector('input[placeholder]')!, "裝置"); await click("捨棄並繼續");
    expect(host.querySelector("form")).toBeNull(); expect(host.textContent).not.toContain("前台預覽");
    expect(mock.save).not.toHaveBeenCalled();
  });
});
