// @vitest-environment jsdom
/** Real CourseRoster + shared editor interaction tests using synthetic data.
 * These establish DOM/state behavior, not browser geometry or live DB writes. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ load: vi.fn(), quick: vi.fn(), save: vi.fn(), status: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/courses", useRouter: () => ({ refresh: m.refresh, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/actions/course-companions", () => ({ addCourseCompanion: vi.fn(), loadCourseCompanionUsage: vi.fn(), saveCourseCompanionUsage: vi.fn() }));
vi.mock("@/server/actions/course-roster-enrollment", () => ({ previewCourseEnrollment: vi.fn(), enrollCourseSeries: vi.fn() }));
vi.mock("@/server/actions/course", () => ({ scheduleTeacherMakeup: vi.fn() }));
vi.mock("@/server/actions/course-checkout-status", () => ({ getCourseCheckoutCashStatus: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ loadCourseSessionDetail: m.load, loadCourseRosterQuick: m.quick, saveCourseRosterNote: m.save, updateCourseBookingStatus: m.status, updateCourseRosterBatch: vi.fn(), createCourseBooking: vi.fn(), saveCourseCustomer: vi.fn(), cancelCourseSession: vi.fn() }));
vi.mock("@/server/actions/course-trial", () => ({ createCourseTrial: vi.fn(), collectCourseTrial: vi.fn(), voidCourseTrialPayment: vi.fn() }));
vi.mock("@/server/actions/course-waitlist", () => ({ joinManagerCourseWaitlist: vi.fn(), promoteCourseWaitlistManually: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal", () => ({ CollectTrialModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal", () => ({ CorrectTrialCollectionModal: () => null }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/components/operation-history-button", () => ({ OperationHistoryButton: () => null }));
import { CourseRoster } from "@/app/(dashboard)/dashboard/courses/roster";
import { OperationScope } from "@/components/operations/operation-scope";

const booking = (id = "a", notes = "原始備註") => ({
  id, customerId: id, customerName: id === "a" ? "甲同學" : "乙同學", customerPhone: "0900000001",
  status: "RESERVED", bookingKind: "CARD", checkedInAt: null, sharedCard: false,
  bookingSource: "店長建立", createdAt: "2026-10-01T02:00:00Z", trialPayments: [], planName: "四堂一期", cardId: `card-${id}`,
  termIndex: 4, termCount: 4, termLeaveCount: 1, termNoShowCount: 1, termPrivateLeaves: [],
  termLessons: [{ date: "2026-10-01T02:00:00Z", status: "待上課" }], termMakeups: [],
  termPayment: { date: "2026-10-01T02:00:00Z", amount: 3200, method: "CASH" },
  nextPaidLessons: 4, nextTerm: { payment: { date: "2026-10-02T02:00:00Z", amount: 3200, method: "CASH" }, lessons: [] },
  absenceCount: 0, absenceHistory: [], available: 2, cardRemaining: 3, unit: "SESSION", pointCost: 1,
  notes, serviceNote: "店內提醒不應修改", assignedCoachName: "店長", assignedCoachId: "coach",
});
const data = (notes = "原始備註") => ({ success: true, data: {
  session: { startsAt: "2026-10-01T02:00:00Z", pointCost: 1, teacherAttendance: "SCHEDULED", teacherNote: "教師提醒" },
  roster: [booking("a", notes), booking("b", "另一位備註")], cards: [], trial: null,
} });
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  m.load.mockResolvedValue(data()); m.save.mockResolvedValue({ success: true });
  m.quick.mockImplementation(() => new Promise(() => {}));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(musicLayout = false, sessionId = "session-a", store = "store-a", canEdit = true) {
  await act(async () => root.render(createElement(OperationScope, { key: store, scope: `account:${store}:course:editable` },
    createElement(CourseRoster, { sessionId, capacity: 10, canCreate: false, canEdit, musicLayout, classType: "GROUP", teacherName: "老師" }))));
}
const row = () => host.querySelector<HTMLButtonElement>('button[aria-label="甲同學 本次備註"]')!.closest("li")!;
const textarea = () => host.querySelector<HTMLTextAreaElement>("[data-inline-roster-note] textarea")!;
async function clickText(text: string, target: ParentNode = host.querySelector("[data-inline-roster-note]")!) {
  await act(async () => [...target.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!.click());
}
async function open() { await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="甲同學 本次備註"]')!.click()); }
async function type(value: string) {
  await act(async () => {
    const input = textarea(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function search(value: string) {
  await act(async () => {
    const query = host.querySelector<HTMLInputElement>('input[placeholder="搜尋姓名或手機"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(query, value);
    query.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it.each([false, true])("%s layout edits in the same row and cancels without opening details or writing", async music => {
  await render(music); const originalRow = row(); await open();
  expect(originalRow.contains(textarea())).toBe(true); expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(textarea().value).toBe("原始備註"); expect(textarea().maxLength).toBe(1000);
  await type("未儲存內容"); await render(music);
  expect(textarea().value).toBe("未儲存內容"); expect(row()).toBe(originalRow);
  await clickText("取消"); expect(textarea()).toBeNull(); expect(m.save).not.toHaveBeenCalled();
  expect(row().textContent).toContain("原始備註"); expect(row().textContent).toContain("店內提醒不應修改");
});
it.each([false, true])("%s layout patches one note while retaining row, payments, history and list position", async music => {
  await render(music); const originalRow = row();
  if (music) await clickText("▶ 查看日期", originalRow);
  const history = host.querySelector('[id="lesson-history-a"]'); const historyText = history?.textContent;
  await open(); await type(" 新備註\n第二行 "); await clickText("儲存");
  expect(m.save).toHaveBeenCalledExactlyOnceWith({ sessionId: "session-a", bookingId: "a", note: "新備註\n第二行", expectedNote: "原始備註" });
  expect(textarea()).toBeNull(); expect(row()).toBe(originalRow); expect(row().textContent).toContain("新備註 第二行");
  expect(host.textContent).toContain("另一位備註"); expect(row().textContent).toContain("店內提醒不應修改");
  if (music) { expect(history?.textContent).toBe(historyText); expect(row().textContent).toContain("本期第 4/4 堂"); expect(row().textContent).toContain("下期已繳 4 堂"); }
  expect(m.load).toHaveBeenCalledTimes(1); expect(m.quick).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it("keeps a rejected draft and compares against an explicitly accepted conflict on retry", async () => {
  m.save.mockResolvedValueOnce({ success: false, error: "同事已更新", currentValue: "最新備註" });
  await render(); await open(); await type("我的備註"); await clickText("儲存");
  expect(textarea().value).toBe("我的備註"); expect(row().textContent).toContain("目前備註：最新備註");
  await clickText("保留我的輸入"); await clickText("儲存");
  expect(m.save).toHaveBeenLastCalledWith({ sessionId: "session-a", bookingId: "a", note: "我的備註", expectedNote: "最新備註" });
  expect(row().textContent).toContain("我的備註");
});
it.each(["before", "during"] as const)("ignores a stale roster refresh started %s the inline save", async timing => {
  await render(); await open(); await type("儲存完成");
  const staleRead = deferred<ReturnType<typeof data>>(); const write = deferred<{ success: boolean }>();
  m.load.mockReturnValueOnce(staleRead.promise); m.save.mockReturnValueOnce(write.promise);
  if (timing === "before") await act(async () => window.dispatchEvent(new Event("focus")));
  await clickText("儲存");
  if (timing === "during") await act(async () => window.dispatchEvent(new Event("focus")));
  expect(m.load).toHaveBeenCalledTimes(2);
  await act(async () => write.resolve({ success: true }));
  await act(async () => staleRead.resolve(data("過時備註")));
  expect(row().textContent).toContain("儲存完成"); expect(row().textContent).not.toContain("過時備註");
});
it.each([false, true])("%s attendance rollback cannot restore an old note over a successful inline save", async music => {
  const status = deferred<{ success: boolean; error: string }>(); m.status.mockReturnValue(status.promise);
  await render(music); await open(); await type("點名前後保留");
  const attendance = row().querySelector<HTMLButtonElement>(`button[aria-label="甲同學：${music ? "點名" : "待點名"}"]`)!;
  await act(async () => attendance.click()); await clickText("儲存");
  await act(async () => status.resolve({ success: false, error: "點名失敗" }));
  expect(row().textContent).toContain("點名前後保留"); expect(row().textContent).not.toContain("原始備註");
});
it.each(["session", "store"] as const)("ignores late save results and does not reuse drafts after changing %s", async scope => {
  const write = deferred<{ success: boolean }>(); m.save.mockReturnValue(write.promise);
  await render(); await open(); await type("舊範圍草稿"); await clickText("儲存");
  m.load.mockResolvedValue(data("新範圍備註")); await render(false, scope === "session" ? "session-b" : "session-a", scope === "store" ? "store-b" : "store-a");
  expect(textarea()).toBeNull(); await act(async () => write.resolve({ success: true }));
  expect(row().textContent).toContain("新範圍備註"); expect(row().textContent).not.toContain("舊範圍草稿");
});
it("patches a saved note even while the row is filtered out", async () => {
  const write = deferred<{ success: boolean }>(); m.save.mockReturnValue(write.promise);
  await render(); await open(); await type("篩選後儲存完成"); await clickText("儲存");
  await search("乙同學"); expect(host.querySelector('button[aria-label="甲同學 本次備註"]')).toBeNull();
  await act(async () => write.resolve({ success: true })); await search("");
  expect(row().textContent).toContain("篩選後儲存完成"); expect(row().textContent).not.toContain("原始備註");
  expect(textarea()).toBeNull();
});
it.each([false, true])("%s keeps the newer saved note when an older filtered-out editor completes late", async music => {
  const firstResponse = deferred<{ success: boolean }>();
  m.save.mockReturnValueOnce(firstResponse.promise)
    .mockResolvedValueOnce({ success: false, error: "備註已更新", currentValue: "第一筆已入庫" })
    .mockResolvedValueOnce({ success: true });
  await render(music); await open(); await type("第一筆已入庫"); await clickText("儲存");
  // The first write has committed in the server fixture, but its response is
  // delayed. Filtering remounts the editor, so a new draft can be submitted.
  await search("乙同學"); await search("");
  expect(textarea().disabled).toBe(false); await type("第二筆最新備註"); await clickText("儲存");
  expect(row().textContent).toContain("目前備註：第一筆已入庫");
  await clickText("保留我的輸入"); await clickText("儲存");
  expect(m.save).toHaveBeenLastCalledWith({ sessionId: "session-a", bookingId: "a", note: "第二筆最新備註", expectedNote: "第一筆已入庫" });
  expect(row().textContent).toContain("第二筆最新備註"); expect(textarea()).toBeNull();
  await act(async () => firstResponse.resolve({ success: true }));
  expect(row().textContent).toContain("第二筆最新備註"); expect(row().textContent).not.toContain("第一筆已入庫");
  await open(); expect(textarea().value).toBe("第二筆最新備註");
});
it.each([false, true])("%s legacy details save supersedes a delayed inline save without changing its action contract", async music => {
  const inlineResponse = deferred<{ success: boolean }>();
  m.save.mockReturnValueOnce(inlineResponse.promise).mockResolvedValueOnce({ success: true });
  m.quick.mockResolvedValue({ success: true, data: {
    ...data("詳情最新備註").data, teacherNote: "教師提醒", teacherAttendance: "SCHEDULED", teacherAttendanceReason: "",
  } });
  await render(music); await open(); await type("較早的行內備註"); await clickText("儲存");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="甲同學 標籤與備註"]')!.click());
  await clickText("編輯本次備註", document.querySelector('[role="dialog"]')!);
  const detailInput = document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(detailInput, "詳情最新備註");
    detailInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => detailInput.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(m.save).toHaveBeenLastCalledWith({ sessionId: "session-a", bookingId: "a", note: "詳情最新備註" });
  expect(m.quick).toHaveBeenCalledOnce(); expect(m.refresh).toHaveBeenCalledOnce();
  expect(row().textContent).toContain("詳情最新備註");
  await act(async () => inlineResponse.resolve({ success: true }));
  expect(row().textContent).toContain("詳情最新備註"); expect(row().textContent).not.toContain("較早的行內備註");
  await open(); expect(textarea().value).toBe("詳情最新備註");
});
it("keeps cancelled bookings and readonly rosters without an inline note pencil", async () => {
  const loaded = data(); loaded.data.roster[0] = { ...booking(), status: "CANCELLED", absenceKind: "STUDENT_LEAVE" } as typeof loaded.data.roster[number];
  m.load.mockResolvedValue(loaded); await render();
  expect(host.querySelector('button[aria-label="甲同學 本次備註"]')).toBeNull();
  expect(host.querySelector('button[aria-label="乙同學 本次備註"]')).toBeTruthy();
  await render(false, "session-a", "store-a", false);
  expect(host.querySelector('button[aria-label="乙同學 本次備註"]')).toBeNull();
});
it("keeps the existing teacher-note and explicit detail editor entrypoints", async () => {
  await render(true); await clickText("教師提醒", host);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("老師 · 教師備註");
  await clickText("取消", document.querySelector('[role="dialog"]')!);
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="甲同學 標籤與備註"]')!.click());
  await clickText("編輯本次備註", document.querySelector('[role="dialog"]')!);
  expect(document.querySelector('[role="dialog"] textarea')).toBeTruthy(); expect(textarea()).toBeNull();
});
