// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),refresh:vi.fn(),search:vi.fn()}));
vi.mock("@/server/actions/course-availability",()=>({getCourseStaffAvailability:async()=>({inheritStoreHours:true,weekly:[],exceptions:[]}),saveCourseStaffAvailabilityException:vi.fn(),saveCourseStaffWeeklyAvailability:vi.fn()}));
vi.mock("@/server/actions/course-browse",()=>({searchCourseCustomers:m.search}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh}),usePathname:()=>"/dashboard/staff"}));
vi.mock("@/server/actions/course-staff",()=>({readCourseStaffTeaching:m.read,saveCourseStaff:m.save}));
vi.mock("@/components/admin/course-batch-selection",()=>({CourseBatchBar:()=>null}));
vi.mock("@/server/actions/course-status",()=>({setCourseStatus:vi.fn()}));
vi.mock("@/components/admin/course-status-button",()=>({CourseStatusButton:()=>null,useCourseStatusRows:(rows:unknown)=>[rows,vi.fn(),[],vi.fn()]}));
vi.mock("@/components/admin/course-display-order",()=>({useCourseDisplayOrder:()=>({compare:()=>0,rowProps:()=>({}),handle:()=>null})}));
import {CourseStaffWorkspace} from "@/app/(dashboard)/dashboard/courses/staff-workspace";
let host:HTMLDivElement,root:Root;
const staff={id:"t",name:"老師",kind:"coach" as const,coachEnabled:true,qualificationIds:["y"],qualificationsConfirmed:true,coachLoginReady:false,birthday:"",emergencyContactRelation:"家人",assignments:[],email:"",phone:"0900000000",emergencyContactName:"聯絡人",emergencyContactPhone:"0900000001",active:true,memberEnabled:true,permissions:[],customerId:""};
beforeEach(()=>{vi.resetAllMocks();m.search.mockResolvedValue({success:true,rows:[],hasMore:false});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);m.read.mockResolvedValue({success:true,version:"2026-09-21T00:00:00.000Z",qualificationIds:["y"],fees:[{templateId:"y",rules:[{mode:"CLASS",value:500}],revision:2}]});m.save.mockResolvedValue({success:false,error:"儲存失敗，請重試"});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(canManage=true){await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates:[{id:"y",name:"瑜珈"},{id:"s",name:"肌力"}],customers:[],canManage,feeEnabled:canManage,permissionGroups:[]})));}
async function click(text:string){const b=Array.from(host.querySelectorAll("button")).find(b=>b.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());}
it("opens teaching directly with inline fee and one save, disabled before changes",async()=>{await render();await click("授課設定");expect(m.read).toHaveBeenCalledTimes(1);expect((host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement).value).toBe("500");expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);expect(host.querySelector('[aria-label="瑜珈每堂授課費"]')?.closest("details")).toBeNull();});
it("opens and saves basic data without loading or resending teaching fees",async()=>{m.save.mockResolvedValue({success:true});await render();await click("編輯");expect(m.read).not.toHaveBeenCalled();const phone=host.querySelector('input[name="phone"]') as HTMLInputElement;await inputValue(phone,"0911222333");await click("儲存變更");expect(m.save).toHaveBeenCalledWith(expect.objectContaining({phone:"0911222333",teachingFees:undefined,musicSettings:undefined}));});
it("submits qualifications and optional fees once without silently treating blank as zero",async()=>{await render();await click("授課設定");const label=Array.from(host.querySelectorAll("label")).find(l=>l.textContent==="肌力")!;await act(async()=>(label.querySelector("input") as HTMLInputElement).click());await click("儲存變更");expect(m.save).toHaveBeenCalledTimes(1);expect(m.save).toHaveBeenCalledWith(expect.objectContaining({qualificationIds:["y","s"],teachingFees:[{templateId:"y",value:{mode:"CLASS",value:500},revision:2},{templateId:"s",value:null,revision:0}]}));expect(host.textContent).toContain("儲存失敗");expect((host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement).value).toBe("500");});
it("keeps an unset coach default distinct from an explicit zero",async()=>{await render();await click("授課設定");const input=host.querySelector('input[name="defaultClassFee"]') as HTMLInputElement;expect(input.value).toBe("");await inputValue(input,"0");await click("儲存變更");expect(m.save).toHaveBeenCalledWith(expect.objectContaining({defaultClassFee:0}));});
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
it("blocks a negative fee on another page and reveals the course",async()=>{
 const templates=[{id:"y",name:"瑜珈"},...Array.from({length:30},(_,i)=>({id:`course-${i}`,name:`課程${i}`}))];
 await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates,customers:[],canManage:true,permissionGroups:[]})));
 await click("授課設定");await inputValue(host.querySelector('[aria-label="瑜珈每堂授課費"]') as HTMLInputElement,"-1");await click("下一頁");await click("儲存變更");
 expect(m.save).not.toHaveBeenCalled();expect(host.textContent).toContain("請填寫「瑜珈」");expect(host.querySelector('[aria-label="瑜珈每堂授課費"]')).not.toBeNull();
});

it("filters legacy permissions so renaming a manager can be saved from the compact editor",async()=>{
 const manager={...staff,id:"manager",name:"蔡店長",kind:"manager" as const,coachEnabled:false,email:"manager@example.test",permissions:["customer.read","talent.read"]};
 await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[manager],maxStaff:10,templates:[],customers:[],canManage:true,permissionGroups:[{label:"顧客管理",codes:[{code:"customer.read",label:"查看顧客"},{code:"customer.update",label:"編輯顧客"}]}]})));
 await click("編輯");
 const name=host.querySelector('input[name="name"]') as HTMLInputElement;
 await inputValue(name,"蔡店長（新）");
 expect(host.textContent).toContain("後台帳號／權限");
 await click("後台帳號／權限");
 expect(host.textContent).toContain("已開啟 1／2 項");
 expect(host.querySelector('[aria-label="搜尋權限"]')).not.toBeNull();
 await click("儲存變更");
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({name:"蔡店長（新）",permissions:["customer.read"]}));
});

it("music qualification editors with read-only pay access can change qualifications without changing fees",async()=>{
 await act(async()=>root.render(createElement(CourseStaffWorkspace,{staff:[staff],maxStaff:10,templates:[{id:"y",name:"吉他"},{id:"s",name:"鋼琴"}],customers:[],canManage:true,music:true,feeEnabled:true,canEditFees:false,permissionGroups:[]})));
 await click("授課設定");
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect((host.querySelector('[aria-label="新增彈性拆帳課程"]') as HTMLSelectElement).disabled).toBe(true);
 await click("編輯課程");
 const qualification=Array.from(host.querySelectorAll("label")).find(l=>l.textContent==="鋼琴")!.querySelector("input")!;
 expect(qualification.disabled).toBe(false);
 await act(async()=>qualification.click());
 await click("儲存變更");
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({qualificationIds:["y","s"],teachingFees:undefined,musicSettings:undefined}));
});
