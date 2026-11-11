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
  expect(host.querySelector('[role="alert"] p')?.textContent).toBe("請重試");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("孩子 A");
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:member", revision: 1 })));
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
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:compact", revision: 1, children: el("p", null, "原會員摘要") })));
  expect(host.textContent).toContain("原會員摘要");
});
it("renders exactly eight cells with only attended dates and does not fill a future reservation", async () => {
  m.summary.mockResolvedValue({ success: true, learners: [{ id: "grid", name: "孩子 A", cards: [{ id: "card", name: "鋼琴八堂", unit: "SESSION", remaining: 6, held: 1, available: 5, shared: false, closed: false, expired: false, grid: { total: 8, dates: ["2026-11-03T03:00:00Z", "2026-11-10T03:00:00Z"] } }], upcoming: [{ id: "reserved", startsAt: "2026-11-17T03:00:00Z", name: "鋼琴", status: "待上課" }], history: [] }] });
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:eight" })));
  const cells = host.querySelectorAll(".cp-phone-grid>li");
  expect(cells).toHaveLength(8);
  expect([...cells].map(cell => cell.textContent)).toEqual(["11/03", "11/10", "", "", "", "", "", ""]);
  expect(host.querySelector<HTMLOListElement>(".cp-phone-grid")!.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
});

const balanceSummary = (remaining: number) => ({ success: true, learners: [{ id: "child-a", name: "孩子 A", cards: [{ id: "card", name: "鋼琴八堂", unit: "SESSION", remaining, held: 0, available: remaining, shared: false, closed: false, expired: false, grid: { total: 8, dates: ["2026-11-10T16:00:00Z"] } }], upcoming: [], history: [{ id: "manual", name: "鋼琴八堂", startsAt: "2026-11-10T16:00:00Z", status: "已出席（補登）", dateOnly: true, quantity: 2, unitLabel: "堂" }] }] });
it("revalidates the family balance on a new server revision and preserves the open learner", async () => {
  m.summary.mockResolvedValueOnce(balanceSummary(8)).mockResolvedValueOnce(balanceSummary(7));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:member", revision: 1 })));
  const learner=host.querySelector<HTMLDetailsElement>('details.cp-phone-learner')!;learner.open=true;
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:member", revision: 2 })));
  expect(m.summary).toHaveBeenCalledTimes(2);expect(host.textContent).toContain("剩餘 7 堂");
  expect(host.querySelector('details.cp-phone-learner')).toBe(learner);expect(learner.open).toBe(true);
  expect(host.textContent).not.toContain("課程紀錄");expect(host.querySelectorAll('details.cp-phone-learner details')).toHaveLength(0);
});
it("ignores an old in-flight revision and marks pending balances as updating", async () => {
  let finish!:(value:unknown)=>void;
  m.summary.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(balanceSummary(6));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:revision", revision: 1 })));
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();expect(host.querySelector('button')).toBeNull();
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:revision", revision: 2 })));
  expect(host.textContent).toContain("剩餘 6 堂");
  await act(async () => finish(balanceSummary(8)));
  expect(host.textContent).not.toContain("剩餘 8 堂");expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});
it("clears family details when an automatic reread rejects access and permits a manual retry", async () => {
  m.summary.mockResolvedValueOnce(balanceSummary(8)).mockResolvedValueOnce({success:false,error:"電話授權已撤銷"}).mockResolvedValueOnce({success:true,learners:[]});
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:access", revision: 1 },el('p',null,'個人摘要'))));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "store:access", revision: 2 },el('p',null,'個人摘要'))));
  expect(host.textContent).not.toContain("孩子 A");expect(host.querySelector('[role="alert"]')?.textContent).toContain("電話授權已撤銷");
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toBe("個人摘要");
});
it("does not read family data in read-only preview even when the revision changes", async () => {
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "preview", revision: 1, disabled: true },'預覽摘要')));
  await act(async () => root.render(el(CoursePhoneLearners, { scope: "preview", revision: 2, disabled: true },'預覽摘要')));
  expect(m.summary).not.toHaveBeenCalled();expect(host.textContent).toBe('預覽摘要');
});
it('shows the four customer plan facts and a dated void marker without an adjustment ledger',async()=>{
 const data=balanceSummary(7);Object.assign(data.learners[0].cards[0],{purchase:{date:'2026-10-27T02:00:00Z',amount:4800},grid:{total:8,dates:['2026-11-03T02:00:00Z'],voidedDates:['2026-11-10T16:00:00Z']}});
 m.summary.mockResolvedValue(data);await act(async()=>root.render(el(CoursePhoneLearners,{scope:'store:four-facts'})));
 expect(host.textContent).toContain('購買 2026-10-27');expect(host.querySelector('[aria-label="方案金額"]')?.textContent).toBe('NT$ 4,800');expect(host.textContent).toContain('剩餘 7 堂');expect(host.textContent).not.toContain('已預約 0');expect(host.querySelector('[data-voided="true"]')?.textContent).toBe('註銷11/11');expect(host.querySelector('.cp-ledger')).toBeNull();
});

it.each([
 {expiresAt:'2027-01-24T15:59:59.999Z',activationDays:null,expected:'2027-01-24 到期'},
 {expiresAt:null,activationDays:70,expected:'首次上課起 70 天'},
 {expiresAt:null,activationDays:null,expected:null},
])('shows only a real expiration or first-use rule without extra headings: $expected',async expiry=>{
 const data=balanceSummary(8);Object.assign(data.learners[0].cards[0],expiry);m.summary.mockResolvedValue(data);
 await act(async()=>root.render(el(CoursePhoneLearners,{scope:'expiry'})));
 if(expiry.expected)expect(host.textContent).toContain(expiry.expected);else expect(host.textContent).not.toContain('到期');
 expect(host.textContent).not.toContain('2099');expect(host.textContent).not.toContain('我的學員');expect(host.textContent).not.toContain('重新讀取');expect(host.textContent).not.toContain('課程紀錄');expect(host.textContent).not.toContain('尚無上課安排');
 expect(host.querySelector('.cp-phone-plan-heading')?.textContent).toContain('剩餘 8 堂');
});
