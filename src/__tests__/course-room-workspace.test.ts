// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";
import { courseRoomInput } from "@/lib/course-room-input";
const m = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }), usePathname: () => "/s/music-test/admin/dashboard/courses", useSearchParams: () => new URLSearchParams("view=rooms&action=create") }));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({}));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map(), compare: () => 0, rowProps: () => ({}), handle: () => null }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
window.scrollTo=vi.fn();
const props = { storeId: "store-a", selectedDate: "2026-10-10", today: "2026-10-10", nowIso: "2026-10-10T01:00:00Z", calendarDays: {}, rooms: [], templates: [], sessions: [], cancelledBookings: [], coaches: [], canCreate: true, canEdit: true, view: "rooms" as const, staffAvailability: [], staffAvailabilityExceptions: [] };
it.each(["MUSIC", "FITNESS"] as const)("%s saves locally, keeps rejected input, and preserves the next draft during props synchronization", async businessProfile => {
  vi.stubGlobal("fetch", m.fetch); m.refresh.mockReset(); m.fetch.mockReset();
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const setName = async (name: string) => act(async () => {
    const input = host.querySelector<HTMLInputElement>('#course-room-create-form input[name="name"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const submit = async () => act(async () => host.querySelector("#course-room-create-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  try {
    await act(async () => root.render(createElement(CourseWorkspace, { ...props, businessProfile })));
    await setName("教室 A"); m.fetch.mockResolvedValueOnce({ json: async () => ({ success: false, error: "同名空間" }) });
    await submit(); expect(host.textContent).toContain("同名空間"); expect(host.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("教室 A");
    expect(m.fetch.mock.calls[0][0]).toBe("/s/music-test/admin/dashboard/courses/rooms");
    const room = { ...courseRoomInput.parse({ name: "教室 A" }), id: "new-room", isActive: true };
    m.fetch.mockResolvedValueOnce({ json: async () => ({ success: true, storeId: "store-a", data: room }) });
    await submit(); expect(host.querySelector("#course-room-create-form")).toBeNull(); expect(host.textContent).toContain("教室 A · 已儲存");
    expect(host.querySelectorAll('[data-new-room="true"]')).toHaveLength(1); expect(m.refresh).not.toHaveBeenCalled();
    const add = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("新增空間"))!;
    await act(async () => add.click()); await setName("下一間草稿");
    await act(async () => root.render(createElement(CourseWorkspace, { ...props, businessProfile, rooms: [room] })));
    expect(host.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("下一間草稿");
    expect(host.querySelectorAll('[data-new-room="true"]')).toHaveLength(1);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("edits a confirmed room without refresh and preserves it through stale props",async()=>{
 const {courseRoomRevision}=await import("@/lib/course-room-input");
 vi.spyOn(window,"scrollTo").mockImplementation(()=>{});vi.stubGlobal("fetch",m.fetch);m.fetch.mockReset();m.refresh.mockReset();
 const original={...courseRoomInput.parse({name:"教室 A"}),id:"room",isActive:true};
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const render=(rooms=[original])=>createElement(CourseWorkspace,{...props,businessProfile:"MUSIC",rooms});
 try{
  await act(async()=>root.render(render()));
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="關閉")!.click());
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="查看教室")!.click());
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="編輯教室")!.click());
  host.querySelector<HTMLInputElement>('#course-edit-form input[name="name"]')!.value="改名教室";
  m.fetch.mockResolvedValueOnce({json:async()=>{throw new Error("lost reply");}});
  const submit=()=>host.querySelector("#course-edit-form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
  await act(async()=>{submit();submit();});expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(m.fetch.mock.calls[0][1].body).expectedRevision).toBe(courseRoomRevision(original));
  expect(host.querySelector<HTMLFieldSetElement>('#course-edit-form fieldset')!.disabled).toBe(true);
  const changed={...original,name:"改名教室"};m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"store-a",data:changed})});
  await act(async()=>{submit();});expect(m.fetch.mock.calls[1][1].body).toBe(m.fetch.mock.calls[0][1].body);
  expect(host.querySelector("#course-edit-form")).toBeNull();expect(host.querySelector("tbody")!.textContent).toContain("改名教室");expect(m.refresh).not.toHaveBeenCalled();
  await act(async()=>root.render(render([{...original}])));expect(host.querySelector("tbody")!.textContent).toContain("改名教室");
  await act(async()=>root.render(render([changed])));
  await act(async()=>root.render(render([{...changed,name:"之後修改"}])));expect(host.querySelector("tbody")!.textContent).toContain("之後修改");
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();}
});
