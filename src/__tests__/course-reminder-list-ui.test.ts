// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/server/actions/course-low-balance", () => ({ saveCourseLowBalanceSetting: mocks.save }));
import { CourseLowBalanceSettings } from "@/app/(dashboard)/dashboard/courses/reminders/low-balance-settings";
let root: Root, host: HTMLDivElement;
const plans = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, name: `方案${i}`, unit: "SESSION", isActive: true, lowBalanceEnabled: true, lowBalanceThreshold: 3 }));
beforeEach(async () => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.save.mockReset().mockResolvedValue({ success: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(CourseLowBalanceSettings, { plans }))); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function click(text: string) { const b = [...host.querySelectorAll("button")].find(b => b.textContent === text)!; expect(b).toBeTruthy(); await act(async () => b.click()); }
async function input(label: string, value: string) { const el = host.querySelector(`input[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); }
it("keeps edits across pagination, search and collapse and saves hidden edits", async () => {
  expect(host.querySelectorAll('input[aria-label$="提醒門檻"]')).toHaveLength(10);
  await input("方案0 提醒門檻", "7"); await click("下一頁"); await input("方案10 提醒門檻", "8");
  await input("搜尋提醒方案", "方案20"); expect(host.querySelectorAll('input[aria-label$="提醒門檻"]')).toHaveLength(1);
  await click("儲存全部修改"); expect(mocks.save.mock.calls.map(c => c[0])).toEqual([{ planId: "p0", enabled: true, threshold: 7 }, { planId: "p10", enabled: true, threshold: 8 }]);
  expect(host.textContent).toContain("已儲存 2 項設定");
});
it("retains failed and unattempted edits without resaving earlier successes", async () => {
  await input("方案0 提醒門檻", "7"); await click("下一頁"); await input("方案10 提醒門檻", "8");
  mocks.save.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: "失敗" }); await click("儲存全部修改"); expect(host.textContent).toContain("其餘修改已保留");
  await click("儲存全部修改"); expect(mocks.save.mock.calls.map(c => c[0].planId)).toEqual(["p0", "p10", "p10"]);
});
it("validates hidden drafts before saving and confirms discard", async () => {
  await input("方案0 提醒門檻", ""); await click("下一頁"); await click("儲存全部修改"); expect(mocks.save).not.toHaveBeenCalled(); expect(host.textContent).toContain("方案0");
  await click("取消修改"); await click("繼續編輯"); expect(host.textContent).toContain("1 項未儲存"); await click("取消修改"); await click("捨棄修改"); expect(host.textContent).toContain("所有設定已儲存");
});
