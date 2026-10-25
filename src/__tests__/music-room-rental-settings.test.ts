// @vitest-environment jsdom
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";

const { createSchedule, refresh, updateRoom, createRoom } = vi.hoisted(() => ({ createSchedule: vi.fn(), refresh: vi.fn(), updateRoom:vi.fn(), createRoom:vi.fn() }));
vi.mock("@/components/admin/use-settings-save",()=>({useSettingsSave:()=>({pending:false,uncertain:false,reset:vi.fn(),save:updateRoom})}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/dashboard/courses", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({ createCourseSchedule: createSchedule, updateCourseRoom:updateRoom, createCourseRoom:createRoom }));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map(), compare:()=>0, rowProps:()=>({}), handle:()=>null }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = {
  selectedDate: "2026-10-01", today: "2026-10-01", nowIso: "2026-10-01T01:00:00Z", calendarDays: {},
  rooms: [{ id: "room", name: "A", category: "", isActive: true, capacity: 10, rentalEnabled:false, rentalHourlyRate:600, rentalBufferMinutes:10 }],
  templates: [{ id: "yoga", name: "瑜珈", category: "", isActive: true, durationMinutes: 60, capacity: 10, pointCost: 2, defaultRoomId: "room" }],
  sessions: [], cancelledBookings: [], coaches: [{ id: "coach", displayName: "黃教練", phone: "", status: "ACTIVE", courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: ["yoga"] }],
  canCreate: true, canEdit: true, businessProfile: "MUSIC" as const, view: "rooms" as const,
  staffAvailability: [], staffAvailabilityExceptions: [],
};


it("music room editing uses the shared rental settings, preserves capacity and retains failed edits", async()=>{
 updateRoom.mockResolvedValue({success:false,error:"儲存失敗，輸入已保留"});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseWorkspace,props)));
  expect([...host.querySelectorAll("thead th")].map(th=>th.textContent)).toEqual(["空間名稱","分類","開放租借","每小時租金","狀態","操作"]);
  expect([...host.querySelectorAll("tbody button")].map(b=>b.textContent)).toEqual(["A","編輯","⋯"]);
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>("tbody button")].find(b=>b.textContent==="編輯")!.click());
  const form=document.querySelector<HTMLFormElement>("#course-edit-form") ?? document.querySelector<HTMLFormElement>("form")!;
  const enabled=form.querySelector<HTMLInputElement>('[name="rentalEnabled"]')!;
  expect(enabled.checked).toBe(false);
  await act(async()=>enabled.click());
  const rate=form.querySelector<HTMLInputElement>('[name="rentalHourlyRate"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(rate,"900");rate.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(updateRoom).toHaveBeenCalledWith(expect.objectContaining({id:"room",capacity:10,rentalEnabled:true,rentalHourlyRate:900,rentalBufferMinutes:10}));
  expect(rate.value).toBe("900");expect(enabled.checked).toBe(true);expect(host.textContent).toContain("輸入已保留");
 }finally{await act(async()=>root.unmount());host.remove();}
});
