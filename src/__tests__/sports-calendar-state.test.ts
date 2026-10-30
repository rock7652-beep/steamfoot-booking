// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("@/components/operations/return-position",()=>({ReturnPosition:({children}:{children:React.ReactNode})=>children}));
vi.mock("@/components/operations/store-view-transition",()=>({StoreViewTransitionProvider:({children}:{children:React.ReactNode})=>children}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:vi.fn()})}));
import {OperationScope} from "@/components/operations/operation-scope";
import {useSportsCalendarState,calendarMode,calendarResource,calendarDate} from "@/components/admin/use-sports-calendar-state";
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function Probe({enabled=true}:{enabled?:boolean}){
 const [mode,setMode]=useSportsCalendarState(enabled,"mode","month",calendarMode),[view,setView]=useSportsCalendarState(enabled,"resourceView","room",calendarResource),[date,setDate]=useSportsCalendarState(enabled,"date","2026-10-18",calendarDate);
 return React.createElement("button",{onClick:()=>{setMode("day");setView("coach");setDate("2027-01-08");}},`${mode}/${view}/${date}`);
}
async function render(scope:string,show=true,enabled=true){await act(async()=>root.render(React.createElement(OperationScope,{key:scope,scope},show?React.createElement(Probe,{enabled}):React.createElement("p",null,"顧客頁"))));}
it("restores day, coach perspective and date after leaving, including a fresh scope boundary in the same tab",async()=>{
 await render("owner:store:sports");await act(async()=>host.querySelector('button')!.click());await render("owner:store:sports",false);await render("owner:store:sports");expect(host.textContent).toBe("day/coach/2027-01-08");await render("other:store:sports");expect(host.textContent).toBe("month/room/2026-10-18");await render("owner:store:sports");expect(host.textContent).toBe("day/coach/2027-01-08");
});
it("another store does not inherit settings; music keeps its original local-state behavior",async()=>{
 await render("owner:sports:sports");await act(async()=>host.querySelector('button')!.click());await render("owner:second:sports");expect(host.textContent).toBe("month/room/2026-10-18");await render("owner:music:music",true,false);await act(async()=>host.querySelector('button')!.click());await render("owner:music:music",false,false);await render("owner:music:music",true,false);expect(host.textContent).toBe("month/room/2026-10-18");
});

// This setter is also used after scheduling and moving a lesson, not just by the date input.
import {useSportsCalendarDate} from '@/components/admin/use-sports-calendar-state';
function DateProbe({syncUrl=true}:{syncUrl?:boolean}){
 const [date,setDate]=useSportsCalendarDate(true,'2026-10-30',new URLSearchParams(window.location.search).get('date'),'/dashboard/courses',syncUrl);
 return React.createElement('button',{onClick:()=>setDate('2026-11-12')},date);
}
it('post-create/move dates update both the visible date and URL without losing other parameters',async()=>{
 window.history.replaceState(null,'','/dashboard/courses?date=2026-10-30&scheduleView=month&coach=qa');
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'date-setter'},React.createElement(DateProbe))));
 await act(async()=>host.querySelector('button')!.click());
 expect(host.textContent).toBe('2026-11-12');expect(new URLSearchParams(window.location.search).get('date')).toBe('2026-11-12');expect(window.location.search).toContain('coach=qa');expect(window.location.search).toContain('scheduleView=month');
});
it('an explicit date link wins over retained state on returning to the calendar',async()=>{
 window.history.replaceState(null,'','/dashboard/courses');
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'date-link'},React.createElement(DateProbe))));await act(async()=>host.querySelector('button')!.click());
 await act(async()=>root.render(React.createElement('div')));window.history.replaceState(null,'','/dashboard/courses?date=2026-10-30');
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'date-link'},React.createElement(DateProbe))));expect(host.textContent).toBe('2026-10-30');
});
it('an external calendar source retains ownership of its URL receipt',async()=>{
 window.history.replaceState(null,'','/dashboard/courses?date=2026-10-30');
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'external-date'},React.createElement(DateProbe,{syncUrl:false}))));await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toBe('2026-11-12');expect(new URLSearchParams(window.location.search).get('date')).toBe('2026-10-30');
});
