// @vitest-environment jsdom
import {createElement,act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({refresh:vi.fn(),fetch:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh,push:vi.fn()}),usePathname:()=>"/s/music/admin/dashboard/courses",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/components/admin/course-display-order",()=>({useCourseDisplayOrder:()=>({rowProps:()=>({}),handle:()=>null,compare:()=>0})}));
vi.mock("@/components/admin/course-setup-step-badge",()=>({CourseSetupStepBadge:()=>null}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:({open,children}:{open:boolean;children:unknown})=>open?children:null}));
vi.mock("@/components/admin/course-test-data-filter",()=>({CourseTestDataFilter:()=>null,isCourseTestData:()=>false}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
vi.mock("@/server/actions/course-batch",()=>({courseStatusImpact:vi.fn(),applyCourseBatchStatus:vi.fn()}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
import {MusicSubjectCatalog} from "@/app/(dashboard)/dashboard/courses/music-subject-catalog";
let host:HTMLDivElement,root:Root;
const row={id:"s1",name:"吉他",category:"",description:"",isActive:true,updatedAt:"2026-10-10T00:00:00.000Z"};
const props={storeId:"store-a",subjects:[],canCreate:true,canEdit:true,initialCreate:true};
beforeEach(async()=>{vi.clearAllMocks();vi.stubGlobal("fetch",m.fetch);host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(MusicSubjectCatalog,props)));const input=host.querySelector<HTMLInputElement>('input[name="name"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"吉他");input.dispatchEvent(new Event("input",{bubbles:true}));});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("shows the authoritative receipt without refresh and retains it through stale props",async()=>{
 let done!:(r:unknown)=>void;m.fetch.mockReturnValue(new Promise(r=>{done=r;}));
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain("儲存中");expect(host.querySelector("tbody")!.textContent).not.toContain("吉他");
 await act(async()=>done({json:async()=>({success:true,storeId:"store-a",data:row})}));
 expect(host.querySelector("tbody")!.textContent).toContain("吉他");expect(host.querySelector("form")).toBeNull();expect(m.refresh).not.toHaveBeenCalled();
 await act(async()=>root.render(createElement(MusicSubjectCatalog,{...props,subjects:[]})));
 expect(host.querySelector("tbody")!.textContent).toContain("吉他");
 await act(async()=>root.render(createElement(MusicSubjectCatalog,{...props,subjects:[row]})));
 expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
});
it("reuses the exact payload/key after an ambiguous network error",async()=>{
 m.fetch.mockRejectedValueOnce(new Error("disconnected")).mockResolvedValue({json:async()=>({success:true,storeId:"store-a",data:row})});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain("尚未確認儲存結果");expect(host.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe("吉他");
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.fetch.mock.calls[0][1].body).toBe(m.fetch.mock.calls[1][1].body);
 expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
});
it("does not display a response for another store",async()=>{
 m.fetch.mockResolvedValue({json:async()=>({success:true,storeId:"other-store",data:row})});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(host.querySelector("tbody")!.textContent).not.toContain("吉他");
 expect(host.textContent).toContain("尚未確認儲存結果");
});

it("sports teaching-item form sends course cost and the same coach qualification IDs",async()=>{
 await act(async()=>root.render(createElement(MusicSubjectCatalog,{...props,sportsNative:true,sportsCoaches:[{id:"coach",name:"王教練"}]})));
 expect(host.querySelector('[aria-label="開放選課每堂扣點"]')).not.toBeNull();
 const coach=host.querySelector<HTMLInputElement>('input[name="sportsCoachIds"]')!;
 await act(async()=>coach.click());
 m.fetch.mockResolvedValue({json:async()=>({success:false,error:"保留輸入"})});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(JSON.parse(m.fetch.mock.calls[0][1].body).sportsRule).toMatchObject({pointCost:1,coachIds:["coach"],expectedCoachIds:[],compensation:{mode:"SHARE",value:60}});
 expect(coach.checked).toBe(true);
});
it('uses the same subject editor with service fields and a Beauty writer, without calling course endpoints',async()=>{
 const save=vi.fn().mockImplementation(async data=>({success:true,data:{...row,name:String(data.get('name'))}}));
 await act(async()=>root.render(createElement(MusicSubjectCatalog,{...props,key:'beauty',catalog:{label:'服務項目',status:{impact:vi.fn(),apply:vi.fn()},order:vi.fn(),feeHref:id=>`?tab=收費方式&serviceId=${id}`,fields:()=>createElement('label',null,'服務時長',createElement('input',{name:'duration',type:'number',required:true,defaultValue:60})),save}})));
 expect(host.textContent).toContain('新增服務項目');expect(host.querySelector('[name="duration"]')).toBeTruthy();expect(host.querySelector('[name="price"]')).toBeNull();
 const input=host.querySelector<HTMLInputElement>('[name="name"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'做臉');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0][0].get('duration')).toBe('60');expect(m.fetch).not.toHaveBeenCalled();expect(host.querySelector('tbody')!.textContent).toContain('做臉');
});
