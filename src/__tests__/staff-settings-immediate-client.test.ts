// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/s/music/admin/dashboard/staff",useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:"a"}));
vi.mock("@/server/actions/staff",()=>({activateStaff:vi.fn(),deactivateStaff:vi.fn(),resetStaffPasswordAction:vi.fn()}));
import {StaffWorkspace,type StaffWorkspacePerson} from "@/app/(dashboard)/dashboard/staff/staff-workspace";
let host:HTMLDivElement,root:Root;
const saved:StaffWorkspacePerson={id:"p",updatedAt:"2026-10-10T00:00:00.000Z",userId:"u",role:"STAFF",permissions:[],displayName:"已確認人員",legalName:"已確認姓名",roleLabel:"門市人員",email:"尚未設定",phone:"0912345678",colorCode:"#123456",status:"ACTIVE",customerCount:0,specialties:"尚未設定專業項目",specialtyKeys:[],emergencyContact:null,weeklyAvailability:[],scheduleExceptions:[],canEdit:true,canResetPassword:true,compensationMode:null,compensationValue:null};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(people:StaffWorkspacePerson[]=[]){await act(async()=>root.render(createElement(StaffWorkspace,{storeId:"s",accountListOnly:true,people,today:"2026-10-10",canManage:true,showSpaCompensation:false,createAction:vi.fn()})));}
async function click(label:string){const b=[...document.body.querySelectorAll("button")].find(b=>b.textContent?.trim().endsWith(label))!;expect(b).toBeTruthy();await act(async()=>b.click());}
async function value(name:string,text:string){const input=document.body.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,text);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function openCreate(){await render();await click("新增人員");await value("name","輸入真名");await value("displayName","輸入顯示名");await value("phone","0912345678");await value("password","test-password");}
async function submit(){await act(async()=>document.body.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("new staff appears from confirmed data immediately and survives stale route props",async()=>{
 const fetch=vi.fn<(url:string,init:RequestInit)=>Promise<{json:()=>Promise<unknown>}>>(async()=>({json:async()=>({success:true,storeId:"s",data:saved})}));vi.stubGlobal("fetch",fetch);await openCreate();await submit();expect(host.textContent).toContain("已確認人員");expect(host.textContent).not.toContain("輸入顯示名");expect(m.refresh).not.toHaveBeenCalled();expect(fetch.mock.calls[0][0]).toBe("/s/music/admin/dashboard/settings-save/staff");await render([]);expect(host.textContent).toContain("已確認人員");
 // A later authoritative update can replace the receipt; older props cannot.
 await render([{...saved,updatedAt:"2026-10-11T00:00:00.000Z",displayName:"後續確認名稱"}]);expect(host.textContent).toContain("後續確認名稱");
});
it("an ambiguous create locks edits and confirms the same payload/key instead of creating again",async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(Error("network lost")).mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:saved})});vi.stubGlobal("fetch",fetch);await openCreate();await submit();expect(document.body.textContent).toContain("尚未確認儲存結果");expect(document.body.querySelector("form fieldset")?.hasAttribute("disabled")).toBe(true);await click("重試確認建立結果");expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(JSON.parse(fetch.mock.calls[1][1].body));expect(host.textContent).toContain("已確認人員");expect(fetch).toHaveBeenCalledTimes(2);
});
