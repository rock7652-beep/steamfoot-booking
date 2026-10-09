// @vitest-environment jsdom
/** Real roster DOM/state tests with synthetic rows. jsdom does not prove pixels,
 * CSS layout, native browser history, Safari, or touch-device behavior. */
import React, { act, createElement } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LabelSnapshot } from "@/lib/customer-labels";
const m = vi.hoisted(() => ({ load: vi.fn(), quick: vi.fn(), labels: vi.fn(), write: vi.fn(), open: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/s/synthetic/admin/dashboard/bookings", useRouter: () => ({ refresh: m.refresh, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children), useLinkStatus: () => ({ pending: false }) }));
vi.mock("@/server/actions/booking-note", () => ({ updateBookingNoteAction: m.write }));
vi.mock("@/server/actions/spa-booking", () => ({ updateSpaBookingNoteAction: m.write }));
vi.mock("@/server/actions/customer-labels", () => ({ loadCustomerLabels: m.labels, setCustomerLabel: m.write, manageCustomerLabels: m.write }));
vi.mock("@/server/actions/course-companions", () => ({ addCourseCompanion: m.write, loadCourseCompanionUsage: vi.fn(), saveCourseCompanionUsage: m.write }));
vi.mock("@/server/actions/course-roster-enrollment", () => ({ previewCourseEnrollment: vi.fn(), enrollCourseSeries: m.write }));
vi.mock("@/server/actions/course", () => ({ scheduleTeacherMakeup: m.write }));
vi.mock("@/server/actions/course-checkout-status", () => ({ getCourseCheckoutCashStatus: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ loadCourseSessionDetail: m.load, loadCourseRosterQuick: m.quick, updateCourseRosterBatch: m.write, createCourseBooking: m.write, saveCourseCustomer: m.write, updateCourseBookingStatus: m.write, cancelCourseSession: m.write, saveCourseRosterNote: m.write, markCourseTeacherAttendance: m.write, loadCourseStudentPurchase: vi.fn(), assignCoursePointCard: m.write, previewFutureCourseStop: vi.fn(), stopFutureCourseLessons: m.write }));
vi.mock("@/server/actions/course-trial", () => ({ createCourseTrial: m.write, collectCourseTrial: m.write, voidCourseTrialPayment: m.write }));
vi.mock("@/server/actions/course-waitlist", () => ({ joinManagerCourseWaitlist: m.write, promoteCourseWaitlistManually: m.write }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal", () => ({ CollectTrialModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal", () => ({ CorrectTrialCollectionModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/steam-booking-drawer", () => ({ SteamBookingDrawer: () => null }));
vi.mock("@/components/operation-history-button", () => ({ OperationHistoryButton: () => null }));
import { CustomerLabelsProvider } from "@/components/customer-labels";
import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";
import { SpaBookingRoster } from "@/app/(dashboard)/dashboard/spa-schedule/booking-roster";
import { CourseRoster } from "@/app/(dashboard)/dashboard/courses/roster";

type Module = "steam" | "spa" | "sports" | "music";
const modules: Module[] = ["steam", "spa", "sports", "music"];
const name = "合成顧客：極長姓名末尾";
const longNote = "第一行：" + "本次長備註".repeat(80) + "\n第二行 <保留文字>\n最後一行：不裁掉";
const longUsual = "平時第一行\n" + "合成提醒".repeat(80) + "\n平時結尾";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 100, height: 44 }] as unknown as DOMRectList);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  m.write.mockResolvedValue({ success: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function renderModule(module: Module, { empty = false, count = 0, long = false, readonly = false, enabled = true, musicGroup = false } = {}) {
  const notes = long ? longNote : "", serviceNote = long ? longUsual : "";
  const labels: LabelSnapshot = { storeId: "synthetic-store", available: true, enabled, canEdit: !readonly, canManage: false, categories: [{ id: "category", name: "合成偏好", number: 1, position: 0, active: true }], labels: Array.from({ length: count }, (_, i) => ({ id: `label-${i}`, name: `合成標籤${i}`, categoryId: "category", active: true })), assignments: { customer: Array.from({ length: count }, (_, i) => `label-${i}`) } };
  m.labels.mockResolvedValue(labels);
  const booking: DayBooking = { id: "synthetic-booking", slotTime: "11:00", people: 1, attendedPeople: null, isMakeup: false, isCheckedIn: false, bookingStatus: "PENDING", bookingType: "PACKAGE_SESSION", expectedAmount: null, trialDefaultPrice: null, collected: false, collectedAmount: null, customer: { id: "customer", name, phone: "", serviceNote, validPackageSessions: 8 }, revenueStaff: null, serviceStaff: null, servicePlan: { name: "合成方案" }, customerPlanWallet: null, notes };
  const roster = empty ? [] : [{ id: "synthetic-course", customerId: "customer", customerName: name, customerPhone: "", sharedCard: false, bookingSource: "合成來源", createdAt: "2026-09-01T02:00:00Z", status: "RESERVED", bookingKind: "CARD", checkedInAt: null, trialPayments: [], planName: "合成多期方案", termIndex: 4, termCount: 4, termLeaveCount: 1, termNoShowCount: 1, termLessons: [{ date: "2026-09-15T02:00:00Z", status: "請假" }, { date: "2026-09-22T02:00:00Z", status: "曠課" }], termPrivateLeaves: ["2026-09-08T02:00:00Z"], nextPaidLessons: 8, termPayment: { date: "2026-09-01T02:00:00Z", amount: 3200, method: "CASH" }, nextTerm: { payment: { date: "2026-09-29T02:00:00Z", amount: 6400, method: "BANK_TRANSFER" }, lessons: [{ date: "2026-10-06T02:00:00Z", status: "待上課" }] }, absenceCount: 2, absenceHistory: [], available: 8, unit: "SESSION", notes, serviceNote, pointCost: 1 }];
  if (musicGroup) for (const booking of roster) booking.termPrivateLeaves = [];
  const session = { startsAt: "2026-09-29T02:00:00Z", pointCost: 1, teacherAttendance: "SCHEDULED", teacherNote: "" };
  m.load.mockResolvedValue({ success: true, data: { session, roster, cards: [], trial: null } });
  m.quick.mockResolvedValue({ success: true, data: { roster, teacherNote: "", teacherAttendance: "SCHEDULED", teacherAttendanceReason: "" } });
  const element = module === "steam" ? createElement(DayDetailPanel, { date: "2026-09-24", bookings: empty ? [] : [booking], slots: [], readOnly: readonly, onBookingClick: m.open })
    : module === "spa" ? createElement(SpaBookingRoster, { bookings: empty ? [] : [{ id: "synthetic-spa", customerId: "customer", serviceStaffId: "staff", serviceLocationId: "room", serviceName: "合成療程", startTime: "10:00", endTime: "11:00", status: "CONFIRMED", totalPrice: 1200, notes, treatmentIds: [], updatedAt: "2026-09-24T02:00:00Z", receipt: { id: "receipt", amount: 1200, paymentMethod: "CASH", paidAt: "2026-09-24T02:00:00Z", refunded: false } }], customers: [{ id: "customer", name, serviceNote }], staff: [{ id: "staff", name: "合成技師" }], locations: [{ id: "room", name: "合成房間" }], canUpdate: !readonly, onOpen: m.open, storeId: "synthetic-store", date: "2026-09-24", onNotesSaved: vi.fn() })
    : createElement(CourseRoster, { sessionId: "synthetic-session", capacity: musicGroup ? 10 : 1, canCreate: false, canEdit: !readonly, musicLayout: module === "music", classType: musicGroup ? "GROUP" : "PRIVATE", teacherName: "合成老師" });
  await act(async () => root.render(jsx(CustomerLabelsProvider, { initial: labels, children: element })));
}
function overview() { return host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 標籤與備註"]`)!; }
function noteDialog() { return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.textContent?.includes(name) && (dialog.textContent.includes("店內備註") || dialog.textContent.includes("平時備註")))!; }
it.each(modules)("%s renders an empty list without a reminder or mutation", async module => {
  await renderModule(module, { empty: true }); expect(host.querySelector("[data-roster-reminders]")).toBeNull(); expect(m.write).not.toHaveBeenCalled(); expect(m.open).not.toHaveBeenCalled();
});
it.each(modules.flatMap(module => [0, 1, 8].map(count => ({ module, count }))))("$module keeps two lines and opens all content with $count labels", async ({ module, count }) => {
  await renderModule(module, { count, long: true });
  const cell = host.querySelector("[data-roster-reminders]")!; const trigger = overview();
  expect(cell.children).toHaveLength(3); expect(trigger.children).toHaveLength(2); expect(trigger.querySelector("button,a,input,select")).toBeNull();
  expect(trigger.textContent).toContain(count ? "合成標籤0" : "無標籤"); if (count === 8) expect(trigger.textContent).toContain("＋3");
  for (let attempt = 0; attempt < 2; attempt++) {
    trigger.focus(); await act(async () => trigger.click()); const dialog = noteDialog();
    expect(dialog).toBeTruthy(); expect(dialog.textContent).toContain(longNote); expect(dialog.textContent).toContain(longUsual);
    const fullText = [...dialog.querySelectorAll("p")].filter(p => p.textContent?.includes("最後一行"));
    expect(fullText).toHaveLength(1); expect(fullText[0].className).toContain("whitespace-pre-wrap");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(noteDialog()).toBeUndefined(); expect(document.activeElement).toBe(trigger);
  }
  expect(m.write).not.toHaveBeenCalled(); expect(m.open).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it.each(modules)("%s respects readonly and disabled label states without changing rows", async module => {
  await renderModule(module, { count: 1, readonly: true }); expect(host.querySelector(`button[aria-label="${name} 本次備註"]`)).toBeNull();
  const labelTrigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 查看標籤"]`) ?? host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 查看或修改標籤"]`);
  await act(async () => labelTrigger!.click());
  expect([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"][aria-label="顧客標籤"] [aria-pressed]')].every(option => option.disabled)).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await renderModule(module, { count: 1, enabled: false }); expect(overview().textContent).not.toContain("合成標籤0"); expect(m.write).not.toHaveBeenCalled();
});
it("music retains term, payment, leave/no-show and future-date information around reminder open/close", async () => {
  await renderModule("music", { count: 8, long: true });
  const preserved = ["本期第 4/4 堂", "下期已繳 8 堂", "2026-09-08 請假・不扣堂", "2026-09-15 請假", "2026-09-22 曠課", "NT$ 3,200 · 現金", "NT$ 6,400 · 轉帳", "2026-10-06 待上課"];
  for (const text of preserved) expect(host.textContent).toContain(text);
  await act(async () => overview().click()); await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  for (const text of preserved) expect(host.textContent).toContain(text); expect(m.write).not.toHaveBeenCalled();
});
it.each(["sports", "music"] as const)("%s note-edit cancel discards a draft without extra writes", async module => {
  await renderModule(module, { long: true });
  const trigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 本次備註"]`)!;
  await act(async () => trigger.click());
  const editor = host.querySelector<HTMLElement>("[data-inline-roster-note]")!;
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const input = editor.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "合成未儲存草稿"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => [...editor.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "取消")!.click());
  expect(document.querySelector("textarea")).toBeNull();
  await act(async () => trigger.click()); expect(document.querySelector("textarea")?.value).toBe(longNote);
  expect(m.write).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it.each(["sports", "music"] as const)("%s note editor supports keyboard Escape and restores its trigger without writing", async module => {
  await renderModule(module, { long: true });
  const trigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 本次備註"]`)!;
  trigger.focus(); await act(async () => trigger.click());
  expect(document.querySelector("textarea")?.value).toBe(longNote);
  await act(async () => document.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector("textarea")).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(m.write).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});

it.each(["sports", "music"] as const)("%s returns from an unconfirmed absence without an accidental write", async module => {
  await renderModule(module, { long: true });
  await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 更多操作"]`)!.click());
  const action = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent === (module === "music" ? "請假" : "缺席・不扣堂"))!;
  await act(async () => action.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="學員請假"]')!;
  await act(async () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "返回")!.click());
  expect(document.querySelector('[role="dialog"][aria-label="學員請假"]')).toBeNull();
  expect(overview()).toBeTruthy(); expect(m.write).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});

it.each(modules)("%s retains the empty reminder skeleton without fabricating content", async module => {
  await renderModule(module); expect(overview().children).toHaveLength(2); expect(overview().textContent).toContain("尚無備註");
  await act(async () => overview().click()); const dialog = noteDialog();
  expect(dialog.textContent?.match(/尚無備註/g)?.length).toBe(2); expect(m.write).not.toHaveBeenCalled();
});
it.each(["sports", "music"] as const)("%s opens its inline note editor without trapping Enter and sends one note-only action", async module => {
  await renderModule(module);
  await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 本次備註"]`)!.click());
  const textarea = document.querySelector("textarea")!, editor = textarea.closest("[data-inline-roster-note]")!;
  const save = [...editor.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "儲存")!;
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(textarea);
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => textarea.dispatchEvent(enter)); expect(enter.defaultPrevented).toBe(false); expect(m.write).not.toHaveBeenCalled();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "合成儲存內容\n第二行"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => save.click());
  expect(m.write).toHaveBeenCalledExactlyOnceWith({ sessionId: "synthetic-session", bookingId: "synthetic-course", note: "合成儲存內容\n第二行", expectedNote: "" });
  expect(document.querySelector("textarea")).toBeNull(); expect(m.refresh).not.toHaveBeenCalled();
});

it.each(["pencil", "full-details"] as const)("music GROUP retains expanded history after reminder dismissal and %s editor cancellation", async entry => {
  await renderModule("music", { count: 8, long: true, musicGroup: true });
  const historyId = "lesson-history-synthetic-course";
  const dates = host.querySelector<HTMLButtonElement>(`button[aria-controls="${historyId}"]`)!;
  const noteTrigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${name} 本次備註"]`)!;
  const historyText = ["2026-09-15 請假", "2026-09-22 曠課", "3. 尚未排課", "4. 尚未排課", "本期付款：2026-09-01 · NT$ 3,200 · 現金", "下期已繳 8 堂 · 2026-09-29 · NT$ 6,400 · 轉帳", "2026-10-06 待上課"];
  function expectExpandedHistory() {
    expect(dates.getAttribute("aria-expanded")).toBe("true");
    const history = document.getElementById(historyId)!;
    expect(history).not.toBeNull();
    expect(host.contains(history)).toBe(true);
    // Assert the expanded DOM branch, not text hidden in a closed details element.
    // This establishes accessible DOM state; jsdom does not measure rendered visibility.
    expect(history.closest('[hidden], [inert], [aria-hidden="true"], details:not([open])')).toBeNull();
    for (const text of historyText) expect(history.textContent).toContain(text);
    const row = dates.closest("li")!;
    expect(row.textContent).toContain("本期第 4/4 堂");
    expect(row.textContent).toContain("此方案請假 1・曠課 1");
  }
  expect(dates.getAttribute("aria-expanded")).toBe("false");
  expect(document.getElementById(historyId)).toBeNull();
  await act(async () => dates.click());
  expectExpandedHistory();

  for (const dismissal of ["Escape", "關閉"]) {
    overview().focus();
    await act(async () => overview().click());
    const dialog = noteDialog();
    expect(dialog.textContent).toContain(longNote);
    expect(dialog.textContent).toContain(longUsual);
    await act(async () => {
      if (dismissal === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "關閉")!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(overview());
    expectExpandedHistory();
  }

  if (entry === "pencil") {
    noteTrigger.focus();
    await act(async () => noteTrigger.click());
  } else {
    await act(async () => overview().click());
    await act(async () => [...noteDialog().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "編輯本次備註")!.click());
  }
  const input = document.querySelector("textarea")!;
  expect(input.value).toBe(longNote);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "團課未儲存草稿\n不應覆蓋原備註"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(input.value).toBe("團課未儲存草稿\n不應覆蓋原備註");
  await act(async () => [...input.closest("form, [data-inline-roster-note]")!.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "取消")!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expectExpandedHistory();

  noteTrigger.focus();
  await act(async () => noteTrigger.click());
  expect(document.querySelector("textarea")?.value).toBe(longNote);
  await act(async () => document.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector("textarea")).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(noteTrigger);
  expectExpandedHistory();
  await act(async () => dates.click());
  expect(document.getElementById(historyId)).toBeNull();
  await act(async () => dates.click());
  expectExpandedHistory();
  dates.focus(); expect(document.activeElement).toBe(dates);
  expect(m.write).not.toHaveBeenCalled();
  expect(m.refresh).not.toHaveBeenCalled();
  expect(m.open).not.toHaveBeenCalled();
});
