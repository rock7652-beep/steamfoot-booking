// @vitest-environment jsdom
import { act, createElement as el } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ summary: vi.fn(), connection: vi.fn(), approve: vi.fn(), view: vi.fn(), revoke: vi.fn() }));
vi.mock("@/server/actions/course-phone-summary", () => ({ loadCoursePhoneSummary: m.summary }));
vi.mock("@/server/actions/course-phone-view", () => ({ loadCoursePhoneConnection: m.connection, confirmCoursePhoneLogin: m.approve, confirmCoursePhoneView: m.view, removeCoursePhoneView: m.revoke }));
import { CoursePhoneLearners } from "@/components/course-phone-learners";
import { CoursePhoneViewPanel } from "@/components/admin/course-phone-view-panel";
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const ready = (name: string) => ({ success: true, learners: [{ id: name, name, cards: [], upcoming: [], history: [] }] });
it("does not display a late previous account's learners after scope changes", async () => {
  let finish: (value: unknown) => void = () => {};
  m.summary.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(ready("新帳號的孩子"));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:old-account" })));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:new-account" })));
  expect(host.textContent).toContain("新帳號的孩子");
  await act(async () => finish(ready("舊帳號的孩子")));
  expect(host.textContent).not.toContain("舊帳號的孩子");
});
it("shows errors with retry and removes family data after a revoked grant is re-read", async () => {
  m.summary.mockResolvedValueOnce({ success: false, error: "請重試" }).mockResolvedValueOnce(ready("孩子 A")).mockResolvedValueOnce({ success: true, learners: [] });
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:member" })));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("請重試");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("孩子 A");
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector('[aria-label="同電話學員課程"]')).toBeNull();
});
it("guards double approval and ignores the old panel's late mutation response", async () => {
  const state = (id: string) => ({ success: true, data: { anchorCustomerId: id, learnerCount: 2, linked: false, grantId: null, canConfirm: true, pending: [{ id: `request-${id}`, verificationCode: "ABC123" }] } });
  m.connection.mockImplementation(async (id: string) => state(id));
  let finish: (value: unknown) => void = () => {};
  m.approve.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(el(CoursePhoneViewPanel, { key: "a", customerId: "a" })));
  const button = host.querySelector("button")!;
  await act(async () => { button.click(); button.click(); });
  expect(m.approve).toHaveBeenCalledOnce();
  expect(m.approve).toHaveBeenCalledWith({ requestId: "request-a", customerId: "a", verificationCode: "ABC123" });
  await act(async () => root.render(el(CoursePhoneViewPanel, { key: "b", customerId: "b" })));
  await act(async () => finish({ success: true }));
  expect(m.connection.mock.calls.map(call => call[0])).toEqual(["a", "b"]);
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});

it("shows one collapsed learner at a time and restores the personal summary after revocation", async () => {
  m.summary.mockResolvedValueOnce(ready("孩子 A")).mockResolvedValueOnce({ success: true, learners: [] });
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:compact", children: el("p", null, "原會員摘要") })));
  expect(host.textContent).not.toContain("原會員摘要");
  expect(host.querySelector("details.cp-phone-learner")?.hasAttribute("open")).toBe(false);
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("原會員摘要");
});
it("renders exactly eight cells with only attended dates and does not fill a future reservation", async () => {
  m.summary.mockResolvedValue({ success: true, learners: [{ id: "grid", name: "孩子 A", cards: [{ id: "card", name: "鋼琴八堂", unit: "SESSION", remaining: 6, held: 1, available: 5, shared: false, closed: false, expired: false, grid: { total: 8, dates: ["2026-11-03T03:00:00Z", "2026-11-10T03:00:00Z"] } }], upcoming: [{ id: "reserved", startsAt: "2026-11-17T03:00:00Z", name: "鋼琴", status: "待上課" }], history: [] }] });
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:eight" })));
  const cells = host.querySelectorAll(".cp-phone-grid>li");
  expect(cells).toHaveLength(8);
  expect([...cells].map(cell => cell.textContent)).toEqual(["11/03", "11/10", "", "", "", "", "", ""]);
  expect(host.querySelector(".cp-phone-grid-five")).toBeNull();
});
