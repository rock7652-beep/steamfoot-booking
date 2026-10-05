// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ card: vi.fn(), growth: vi.fn() }));
vi.mock("@/server/actions/course-browse", () => ({ browseCourseCards: m.card }));
vi.mock("@/server/actions/growth-drawer", () => ({ fetchGrowthCustomerDrawer: m.growth }));
vi.mock("@/app/(dashboard)/dashboard/courses/card-reservations", () => ({ CourseCardReservations: () => null }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: ({ children }: { children: React.ReactNode }) => React.createElement("div", {role:"dialog"}, children) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/talent-pipeline-section", () => ({ TalentPipelineSection: ({ customerId }: { customerId: string }) => React.createElement("span", null, `details-${customerId}`) }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/points-section", () => ({ PointsSection: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/referral-wrapper", () => ({ ReferralWrapper: () => null }));
import { useCardDetail } from "@/app/(dashboard)/dashboard/courses/use-card-detail";
import { GrowthCustomerDrawer } from "@/app/(dashboard)/dashboard/growth/_components/customer-drawer";
import { PanelReadProvider, usePanelReader } from "@/components/operations/panel-read-cache";
import { browseCourseCards } from "@/server/actions/course-browse";
import { CourseCardBrowser } from "@/app/(dashboard)/dashboard/courses/card-browser";
let host: HTMLDivElement, root: Root;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
function card(id: string) { return { success: true, rows: [{ id, name: `fresh-${id}` }], hasMore: false }; }
function growth(id: string) { return { customer: { id, name: `name-${id}`, talentStage: "CUSTOMER", customerStage: "ACTIVE", phone: "", totalPoints: 0, sponsor: null }, referralCount: 0 }; }
function CardHarness({ id, open = true, opening = 1 }: { id: string; open?: boolean; opening?: number }) {
  const detail = useCardDetail(open, id, opening);
  const reader = usePanelReader("course-card", browseCourseCards);
  return React.createElement(React.Fragment, null,
    React.createElement("button", {onPointerEnter: () => reader.prefetch({cardId:id}), onFocus: () => reader.prefetch({cardId:id}), onTouchStart: () => reader.prefetch({cardId:id})}, "intent"),
    open && React.createElement("div", null, detail.loading ? "loading" : detail.error ?? detail.data?.name,
      React.createElement("button", {disabled:detail.loading,onClick:detail.retry}, "retry")));
}
async function renderCard(id: string, open = true, opening = 1) {
  await act(async () => root.render(React.createElement(PanelReadProvider, null, React.createElement(CardHarness, {id,open,opening}))));
}
async function renderGrowth(id: string, open = true) {
  await act(async () => root.render(React.createElement(PanelReadProvider, null, React.createElement(GrowthCustomerDrawer, {open,customerId:id,summary:{name:`summary-${id}`,talentStage:"CUSTOMER"},isOwner:false,onClose:vi.fn()}))));
}
async function click(text: string) { await act(async () => { Array.from(host.querySelectorAll("button")).find(b => b.textContent === text)!.click(); }); }
beforeEach(() => { vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); root = createRoot(host); m.card.mockImplementation(async ({ cardId }) => card(cardId)); m.growth.mockImplementation(async id => growth(id)); });
afterEach(async () => { await act(async () => root.unmount()); });
it.each(["pointerover", "focusin", "touchstart"])("course %s preload shares in-flight read and reopen gets fresh data", async event => {
  const pending = deferred<ReturnType<typeof card>>(); m.card.mockReturnValueOnce(pending.promise);
  await renderCard("a", false);
  expect(m.card).not.toHaveBeenCalled();
  await act(async () => { host.querySelector("button")!.dispatchEvent(new Event(event, { bubbles: true })); });
  await renderCard("a"); expect(m.card).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("loading");
  await act(async () => pending.resolve(card("a")));
  expect(host.textContent).toContain("fresh-a");
  await renderCard("a", false); await renderCard("a", true, 2);
  expect(m.card).toHaveBeenCalledTimes(2);
});
it("course retries a rejection and ignores a late retry after switching cards", async () => {
  m.card.mockRejectedValueOnce(new Error("offline")); await renderCard("a");
  expect(host.textContent).toContain("讀取方案失敗");
  const pending = deferred<ReturnType<typeof card>>(); m.card.mockReturnValueOnce(pending.promise);
  await click("retry"); expect(host.textContent).toContain("loading");
  await renderCard("b", true, 2);
  await act(async () => pending.resolve(card("a")));
  expect(host.textContent).toContain("fresh-b"); expect(host.textContent).not.toContain("fresh-a");
});
it("course retries an unsuccessful payload or missing card without enabling stale data", async () => {
  m.card.mockResolvedValueOnce({ success: false, error: "denied" });
  await renderCard("a"); expect(host.textContent).toContain("denied");
  m.card.mockResolvedValueOnce({ success: true, rows: [] });
  await click("retry"); expect(host.textContent).toContain("找不到方案");
  await click("retry"); expect(host.textContent).toContain("fresh-a");
});
it.each(["pointerover", "focusin", "touchstart"])("actual course browser %s starts the same detail resource", async event => {
  m.card.mockResolvedValueOnce({success:true,rows:[{id:"a",name:"plan-a",unit:"SESSION",remaining:10,held:0,available:10,expiresAt:"2026-12-31",members:[{name:"member"}],entries:[]}],hasMore:false});
  await act(async () => root.render(React.createElement(PanelReadProvider,null,React.createElement(CourseCardBrowser,{state:{search:"",history:false,page:0},onChange:vi.fn(),onSelect:vi.fn()}))));
  await act(async () => { await new Promise(resolve=>setTimeout(resolve,250)); });
  const pending=deferred<ReturnType<typeof card>>();m.card.mockReturnValueOnce(pending.promise);
  await act(async () => { Array.from(host.querySelectorAll("button")).find(b=>b.textContent?.includes("plan-a"))!.dispatchEvent(new Event(event,{bubbles:true})); });
  expect(m.card).toHaveBeenLastCalledWith({cardId:"a"});
  await renderCard("a"); expect(m.card).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(card("a"))); expect(host.textContent).toContain("fresh-a");
});
it("growth retries in place and shows the current summary while pending", async () => {
  m.growth.mockRejectedValueOnce(new Error("offline")); await renderGrowth("a");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("offline");
  const pending = deferred<ReturnType<typeof growth>>(); m.growth.mockReturnValueOnce(pending.promise);
  await click("重新載入"); expect(host.textContent).toContain("summary-a");
  expect(host.textContent).not.toContain("details-a");
  await act(async () => pending.resolve(growth("a")));
  expect(host.textContent).toContain("details-a"); expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("growth does not carry an old error or detail into the next customer", async () => {
  m.growth.mockRejectedValueOnce(new Error("old-error")); await renderGrowth("a");
  const pending = deferred<ReturnType<typeof growth>>(); m.growth.mockReturnValueOnce(pending.promise);
  await renderGrowth("b");
  expect(host.textContent).toContain("summary-b"); expect(host.textContent).not.toContain("old-error");
  await act(async () => pending.resolve(growth("b"))); expect(host.textContent).toContain("details-b");
});
it("growth ignores a late response and rereads after close and reopen", async () => {
  const pending = deferred<ReturnType<typeof growth>>(); m.growth.mockReturnValueOnce(pending.promise);
  await renderGrowth("a"); await renderGrowth("b");
  await act(async () => pending.resolve(growth("a")));
  expect(host.textContent).toContain("details-b"); expect(host.textContent).not.toContain("details-a");
  await renderGrowth("b", false);
  const reopened = deferred<ReturnType<typeof growth>>(); m.growth.mockReturnValueOnce(reopened.promise);
  await renderGrowth("b");
  expect(host.textContent).toContain("summary-b"); expect(host.textContent).not.toContain("details-b");
  await act(async () => reopened.resolve(growth("b")));
  expect(m.growth).toHaveBeenCalledTimes(3); expect(host.textContent).toContain("details-b");
});
