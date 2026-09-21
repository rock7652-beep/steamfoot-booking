// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),refresh:vi.fn(),search:vi.fn()}));
vi.mock("@/server/actions/course-browse",()=>({searchCourseCustomers:m.search}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh}),usePathname:()=>"/dashboard/staff"}));
vi.mock("@/server/actions/course-staff",()=>({readCourseStaffTeaching:m.read,saveCourseStaff:m.save}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
import {CourseStaffWorkspace} from "@/app/(dashboard)/dashboard/courses/staff-workspace";
let host:HTMLDivElement,root:Root;
const staff={id:"t",name:"老師",kind:"coach" as const,coachEnabled:true,qualificationIds:["y"],qualificationsConfirmed:true,coachLoginReady:false,birthday:"",emergencyContactRelation:"家人",assignments:[],email:"",phone:"0900000000",emergencyContactName:"聯絡人",emergencyContactPhone:"0900000001",active:true,memberEnabled:true,permissions:[],customerId:""};
beforeEach(()=>{vi.resetAllMocks();m.search.mockResolvedValue({success:true,rows:[],hasMore:false});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);m.read.mockResolvedValue({success:true,version:"2026-09-21T00:00:00.000Z",qualificationIds:["y"],fees:[{templateId:"y",rules:[{mode:"CLASS",value:500}],revision:2}]});m.save.mockResolvedValue({success:false,error:"儲存失敗，請重試"});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(canManage=true){await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates:[{id:"y",name:"瑜珈"},{id:"s",name:"肌力"}],customers:[],canManage,permissionGroups:[]})));}
async function click(text:string){const b=Array.from(host.querySelectorAll("button")).find(b=>b.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());}
it("opens teaching directly with inline fee and one save, disabled before changes",async()=>{await render();await click("授課設定");expect(m.read).toHaveBeenCalledTimes(1);expect((host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement).value).toBe("500");expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);expect(host.querySelectorAll("details")).toHaveLength(0);});
it("submits qualifications and all fees once and retains inputs on failure",async()=>{await render();await click("授課設定");const label=Array.from(host.querySelectorAll("label")).find(l=>l.textContent==="肌力")!;await act(async()=>(label.querySelector("input") as HTMLInputElement).click());await click("儲存變更");expect(m.save).toHaveBeenCalledTimes(1);expect(m.save).toHaveBeenCalledWith(expect.objectContaining({qualificationIds:["y","s"],teachingFees:[{templateId:"y",value:{mode:"CLASS",value:500},revision:2},{templateId:"s",value:{mode:"CLASS",value:0},revision:0}]}));expect(host.textContent).toContain("儲存失敗");expect((host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement).value).toBe("500");});
it("does not allow saving when fee loading fails",async()=>{m.read.mockResolvedValue({success:false,error:"無法讀取"});await render();await click("授課設定");expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);expect(host.textContent).toContain("無法讀取");expect(m.save).not.toHaveBeenCalled();});
it("read-only accounts cannot load or edit compensation",async()=>{await render(false);await click("查看");expect(m.read).not.toHaveBeenCalled();expect(host.querySelector('button[type="submit"]')).toBeNull();});

async function inputValue(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
it("preserves fee edits across 100 courses and includes selections from other pages in one save",async()=>{
 const templates=[{id:"y",name:"瑜珈"},...Array.from({length:99},(_,i)=>({id:`course-${i}`,name:`課程${i}`}))];
 await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates,customers:[],canManage:true,permissionGroups:[]})));
 await click("授課設定");
 await inputValue(host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement,"650");
 await click("下一頁");
 expect(host.querySelector('[aria-label="瑜珈每堂授課費"]')).toBeNull();
 const label=Array.from(host.querySelectorAll("label")).find(l=>l.textContent==="課程9")!;
 await act(async()=>(label.querySelector("input") as HTMLInputElement).click());
 await inputValue(host.querySelector('[aria-label="課程9每堂授課費"]') as HTMLInputElement,"800");
 await click("上一頁");expect((host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement).value).toBe("650");
 await click("儲存變更");expect(m.save).toHaveBeenCalledWith(expect.objectContaining({qualificationIds:["y","course-9"],teachingFees:[{templateId:"y",value:{mode:"CLASS",value:650},revision:2},{templateId:"course-9",value:{mode:"CLASS",value:800},revision:0}]}));
});
it("blocks an invalid fee on another page and reveals the course instead of submitting zero",async()=>{
 const templates=[{id:"y",name:"瑜珈"},...Array.from({length:30},(_,i)=>({id:`course-${i}`,name:`課程${i}`}))];
 await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates,customers:[],canManage:true,permissionGroups:[]})));
 await click("授課設定");await inputValue(host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement,"");await click("下一頁");await click("儲存變更");
 expect(m.save).not.toHaveBeenCalled();expect(host.textContent).toContain("請填寫「瑜珈」");expect(host.querySelector('[aria-label="瑜珈每堂授課費"]')).not.toBeNull();
});
