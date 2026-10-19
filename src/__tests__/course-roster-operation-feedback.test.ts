// @vitest-environment jsdom
/** Real CourseRoster failure/concurrency tests using synthetic data.
 * These establish DOM/state behavior, not browser geometry or live DB writes. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ load: vi.fn(), quick: vi.fn(), save: vi.fn(), status: vi.fn(), batch: vi.fn(), refresh: vi.fn(), confirmed: vi.fn(), native: vi.fn() }));
vi.mock("@/lib/sports-session-detail-client",()=>({readSportsSessionDetail:m.native}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/courses", useRouter: () => ({ refresh: m.refresh, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/actions/course-companions", () => ({ addCourseCompanion: vi.fn(), loadCourseCompanionUsage: vi.fn(), saveCourseCompanionUsage: vi.fn() }));
vi.mock("@/server/actions/course-roster-enrollment", () => ({ previewCourseEnrollment: vi.fn(), enrollCourseSeries: vi.fn() }));
vi.mock("@/server/actions/course", () => ({ scheduleTeacherMakeup: vi.fn() }));
vi.mock("@/server/actions/course-checkout-status", () => ({ getCourseCheckoutCashStatus: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ loadCourseSessionDetail: m.load, loadCourseRosterQuick: m.quick, saveCourseRosterNote: m.save, updateCourseBookingStatus: m.status, updateCourseRosterBatch: m.batch, createCourseBooking: vi.fn(), saveCourseCustomer: vi.fn(), cancelCourseSession: vi.fn() }));
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
  m.native.mockResolvedValue(data()); m.load.mockResolvedValue(data()); m.save.mockResolvedValue({ success: true });
  m.quick.mockImplementation(() => new Promise(() => {}));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(musicLayout = false, sessionId = "session-a", store = "store-a", canEdit = true, sportsNative = false) {
  await act(async () => root.render(createElement(OperationScope, { key: store, scope: `account:${store}:course:editable` },
    createElement(CourseRoster, { sessionId, sportsNative, capacity: 10, canCreate: false, canEdit, musicLayout, classType: "GROUP", teacherName: "老師", onAttendanceOptimistic: m.confirmed }))));
}

const row = (name = "甲同學") => host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 更多操作"]`)!.closest("li")!;
const attendance = (name = "甲同學") => row(name).querySelector<HTMLButtonElement>("button[data-roster-action-trigger]")!;
async function clickAttendance(name = "甲同學") { await act(async () => attendance(name).click()); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

it.each([false, true])("%s shows local pending immediately, guards same-tick repeats and waits for server confirmation", async music => {
  const write = deferred<{ success: boolean }>(); m.status.mockReturnValue(write.promise);
  await render(music);
  const originalRow = row(); const label = attendance().getAttribute("aria-label");
  await act(async () => { const control = attendance(); control.click(); control.click(); });
  expect(m.status).toHaveBeenCalledOnce(); expect(row()).toBe(originalRow);
  expect(attendance("乙同學").disabled).toBe(!music);
  expect(row().querySelector('[data-roster-action-feedback]')?.textContent).toBe("儲存中…");
  expect(attendance().disabled).toBe(true); expect(attendance().getAttribute("aria-label")).toBe(label);
  expect(m.confirmed).not.toHaveBeenCalled(); expect(row().textContent).not.toContain("✓");
  await act(async () => write.resolve({ success: true }));
  expect(m.confirmed).toHaveBeenCalledExactlyOnceWith("a", "ATTENDED", false);
  expect(attendance().getAttribute("aria-label")).toBe("甲同學：已出席");
  expect(row().querySelector('[data-roster-action-feedback]')).toBeNull();
});

it.each([false, true])("%s preserves a rejected write when reconciliation also rejects", async music => {
  m.status.mockResolvedValue({ success: false, error: "額度不足，未完成點名" });
  m.quick.mockRejectedValue(new Error("read offline"));
  await render(music); await clickAttendance();
  expect(row().querySelector('[role="alert"]')?.textContent).toBe("額度不足，未完成點名");
  expect(host.textContent).not.toContain("已儲存"); expect(m.confirmed).not.toHaveBeenCalled();
  expect(attendance().disabled).toBe(false); expect(attendance().getAttribute("aria-label")).not.toContain("已出席");
  expect(row("乙同學").querySelector('[role="alert"]')).toBeNull();
});

it.each(["throw", "malformed", "read-result"])("preserves unknown write results and prevents replay when %s", async mode => {
  if (mode === "malformed") m.status.mockResolvedValue({});
  else m.status.mockRejectedValue(new Error("write response lost"));
  if (mode === "read-result") m.quick.mockResolvedValue({ success: false, error: "讀取遭拒" });
  else m.quick.mockRejectedValue(new Error("read offline"));
  await render(); await clickAttendance();
  expect(row().querySelector('[role="alert"]')?.textContent).toContain("結果待確認");
  expect(host.textContent).not.toContain("已儲存"); expect(host.textContent).not.toContain("讀取遭拒");
  expect(attendance().disabled).toBe(true); await clickAttendance();
  expect(m.status).toHaveBeenCalledOnce(); expect(m.confirmed).not.toHaveBeenCalled();
});

it.each(["throw", "result"])("only confirmed success may show the saved-but-refresh-failed warning (%s)", async mode => {
  m.status.mockResolvedValue({ success: true });
  if (mode === "throw") m.quick.mockRejectedValue(new Error("read offline"));
  else m.quick.mockResolvedValue({ success: false, error: "讀取遭拒" });
  await render(); await clickAttendance();
  expect(row().querySelector('[data-roster-action-feedback]')?.textContent).toBe("已儲存，名單更新失敗，請重新開啟核對");
  expect(attendance().getAttribute("aria-label")).toBe("甲同學：已出席");
  expect(m.confirmed).toHaveBeenCalledOnce(); expect(attendance().disabled).toBe(false);
});

it("keeps independent music row outcomes when a concurrent success finishes after a rejection", async () => {
  const a = deferred<{ success: boolean; error: string }>(); const b = deferred<{ success: boolean }>();
  m.status.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); m.quick.mockRejectedValue(new Error("read offline"));
  await render(true); await clickAttendance(); await clickAttendance("乙同學");
  expect(m.status).toHaveBeenCalledTimes(2); expect(row("乙同學").textContent).toContain("儲存中…");
  await act(async () => a.resolve({ success: false, error: "甲未完成" }));
  expect(m.quick).not.toHaveBeenCalled();
  await act(async () => b.resolve({ success: true }));
  expect(row().querySelector('[role="alert"]')?.textContent).toBe("甲未完成");
  expect(row().textContent).not.toContain("已儲存");
  expect(row("乙同學").textContent).toContain("已儲存，名單更新失敗");
  expect(m.confirmed).toHaveBeenCalledExactlyOnceWith("b", "ATTENDED", false);
});

it.each([true, false])("keeps an unknown-row warning when another concurrent music row completes (success=%s)", async success => {
  const a = deferred<{ success: boolean }>(); const b = deferred<{ success: boolean; error?: string }>();
  m.status.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); m.quick.mockRejectedValue(new Error("read offline"));
  await render(true); await clickAttendance(); await clickAttendance("乙同學");
  await act(async () => a.reject(new Error("lost response")));
  await act(async () => b.resolve({ success, error: success ? undefined : "乙未完成" }));
  expect(row().querySelector('[role="alert"]')?.textContent).toContain("結果待確認");
  expect(host.querySelector('p.rounded-lg')?.textContent).toContain("結果待確認");
  expect(attendance().disabled).toBe(true);
});

it("does not let an old reconciliation failure replace a newer row action", async () => {
  const read = deferred<unknown>(); const nextWrite = deferred<{ success: boolean; error: string }>();
  m.status.mockResolvedValueOnce({ success: true }).mockReturnValueOnce(nextWrite.promise); m.quick.mockReturnValueOnce(read.promise);
  await render(true); await clickAttendance(); await clickAttendance("乙同學");
  await act(async () => read.reject(new Error("old failed read")));
  expect(host.textContent).not.toContain("名單更新失敗"); expect(row("乙同學").textContent).toContain("儲存中…");
  m.quick.mockRejectedValue(new Error("latest failed read"));
  await act(async () => nextWrite.resolve({ success: false, error: "乙未完成" }));
  expect(row("乙同學").textContent).toContain("乙未完成"); expect(row("乙同學").textContent).not.toContain("已儲存");
});

it("new sessions own locks and ignore old results even after A → B → A", async () => {
  const old = deferred<{ success: boolean }>(); const current = deferred<{ success: boolean }>();
  m.status.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render(); await clickAttendance();
  await render(false, "session-b"); await render(false, "session-a");
  expect(attendance().disabled).toBe(false); await clickAttendance();
  await act(async () => old.resolve({ success: true }));
  expect(m.confirmed).not.toHaveBeenCalled(); expect(row().textContent).toContain("儲存中…");
  expect(attendance().disabled).toBe(true); expect(m.quick).not.toHaveBeenCalled();
  await act(async () => current.resolve({ success: true })); expect(m.confirmed).toHaveBeenCalledOnce();
});

it("batch rejection is local to selected rows and does not become unknown after read failure", async () => {
  m.batch.mockResolvedValue({ success: false, error: "批次狀態已變更" }); m.quick.mockRejectedValue(new Error("read offline"));
  await render();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "批次點名")!.click());
  await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="全選搜尋結果中可操作的學員"]')!.click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "點名這 2 人")!.click());
  expect(m.batch).toHaveBeenCalledOnce(); expect(row().querySelector('[role="alert"]')?.textContent).toBe("批次狀態已變更");
  expect(row("乙同學").querySelector('[role="alert"]')?.textContent).toBe("批次狀態已變更");
  expect(host.textContent).not.toContain("結果待確認"); expect(host.textContent).not.toContain("已儲存"); expect(m.confirmed).not.toHaveBeenCalled();
});


it("native sports refreshes the idle roster without resetting the mounted row",async()=>{
 vi.useFakeTimers();vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
 try {
  await render(false,"session-a","sports",true,true);const original=row();
  const updated=data();updated.data.roster[0].status="ATTENDED";m.native.mockResolvedValue(updated);
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  expect(m.native).toHaveBeenCalledTimes(2);expect(row()).toBe(original);expect(attendance().getAttribute("aria-label")).toBe("甲同學：已出席");expect(m.refresh).not.toHaveBeenCalled();
 } finally {vi.useRealTimers();}
});
it("native background reads pause during an unconfirmed write and cannot paint a stale result",async()=>{
 vi.useFakeTimers();vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
 try {
  const write=deferred<{success:boolean}>();m.status.mockReturnValue(write.promise);
  await render(false,"session-a","sports",true,true);await clickAttendance();
  await act(async()=>{await vi.advanceTimersByTimeAsync(9000);});
  expect(m.native).toHaveBeenCalledOnce();expect(attendance().getAttribute("aria-label")).not.toContain("已出席");expect(m.status).toHaveBeenCalledOnce();
  await act(async()=>write.resolve({success:true}));expect(attendance().getAttribute("aria-label")).toBe("甲同學：已出席");
 } finally {vi.useRealTimers();}
});
