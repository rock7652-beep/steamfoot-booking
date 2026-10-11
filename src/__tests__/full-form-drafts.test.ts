// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {OperationScope} from "@/components/operations/operation-scope";
import {CourseCustomerDraftForm,CoursePlanDraftForm} from "@/app/(dashboard)/dashboard/courses/course-profile-forms";
const m=vi.hoisted(()=>({customer:vi.fn(),plan:vi.fn(),refresh:vi.fn(),saved:vi.fn(),pending:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:m.customer,saveCoursePointPlan:m.plan}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const person={id:"a",updatedAt:"2026-09-27T00:00:00.000Z",name:"原姓名",phone:"0912345678",email:null,gender:null,birthday:"",serviceNote:null,address:null,notes:null,emergencyContactName:null,emergencyContactPhone:null};
beforeEach(()=>{vi.stubGlobal("fetch",async (_url:string,init:RequestInit)=>({json:async()=>m.plan(JSON.parse(String(init.body)))}));sessionStorage.clear();vi.resetAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(p:typeof person|null=person,scope="user:store-a"){
 await act(async()=>root.render(React.createElement(OperationScope,{key:scope,scope},React.createElement(CourseCustomerDraftForm,{key:p?.id??"new",person:p,canEdit:true,canCreate:true,hidden:false,onPending:m.pending,onSaved:m.saved}))));
}
async function input(name:string,value:string){const e=host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(e,value);e.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("creates no draft when viewing or returning fields to their original values",async()=>{
 await render();expect(host.textContent).not.toContain("尚未儲存");await input("name","改名");expect(host.textContent).toContain("尚未儲存");await input("name","原姓名");expect(host.textContent).not.toContain("尚未儲存");
});
it("keeps record, create, account and store drafts isolated",async()=>{
 await render();await input("name","A草稿");await render({...person,id:"b"});expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("原姓名");
 await render(null);await input("name","新增草稿");await render();expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("A草稿");
 await render(person,"user:store-b");expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("原姓名");
 await render(person,"other:store-a");expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("原姓名");
});
it("retains incomplete birthday parts after unmount and reopening",async()=>{
 await render();const year=host.querySelector<HTMLInputElement>('#birthday-year')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(year,"1985");year.dispatchEvent(new Event("input",{bubbles:true}));});
 await render({...person,id:"b"});await render();expect(host.querySelector<HTMLInputElement>('#birthday-year')!.value).toBe("1985");expect(host.querySelector<HTMLInputElement>('[name="birthday"]')!.value).toBe("");
});
it("does not replace restored input with a newer server version or submit stale data",async()=>{
 await render();await input("name","我的輸入");await render({...person,name:"同事修改",updatedAt:"2026-09-27T01:00:00.000Z"});
 expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("我的輸入");expect(host.textContent).toContain("資料已有更新");await submit();expect(m.customer).not.toHaveBeenCalled();
 vi.spyOn(window,"confirm").mockReturnValue(true);await act(async()=>host.querySelector("button")!.click());expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("同事修改");
});
it("retains validation and network failures, and never replays automatically",async()=>{
 m.customer.mockResolvedValueOnce({success:false,error:"電話格式錯誤"}).mockRejectedValueOnce(Error("offline"));
 await render();await input("name","待儲存");await submit();expect(host.textContent).toContain("電話格式錯誤");await submit();expect(host.textContent).toContain("連線中斷");
 await act(async()=>window.dispatchEvent(new Event("online")));expect(m.customer).toHaveBeenCalledTimes(2);expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("待儲存");
});
it("submits once, passes the original revision and clears only on success",async()=>{
 let done!:(v:unknown)=>void;m.customer.mockImplementation(()=>new Promise(r=>{done=r;}));await render();await input("name","新姓名");await submit();await submit();expect(m.customer).toHaveBeenCalledOnce();expect(m.customer.mock.calls[0][0]).toMatchObject({expectedUpdatedAt:person.updatedAt,name:"新姓名"});
 await act(async()=>done({success:true}));expect(m.saved).toHaveBeenCalledOnce();expect(host.textContent).not.toContain("尚未儲存");
});
it("an old request cannot close a newly selected customer",async()=>{
 let done!:(v:unknown)=>void;m.customer.mockImplementation(()=>new Promise(r=>{done=r;}));await render();await input("name","A");await submit();await render({...person,id:"b"});await act(async()=>done({success:true}));expect(m.saved).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("原姓名");
});
it("keeps course selections and an empty numeric input through a remount",async()=>{
 const plan={id:"p",name:"方案",points:10,price:1000,validDays:90,isActive:true,unit:"SESSION",templateIds:[]};
 const mount=async()=>act(async()=>root.render(React.createElement(OperationScope,{scope:"user:store-a"},React.createElement(CoursePlanDraftForm,{storeId:"store",plan,templates:[{id:"t",name:"課程A",category:"團課",isActive:true}],termSessions:[],profitEnabled:true,onPending:m.pending,onSaved:m.saved}))));
 await mount();await input("price","");await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"][value="t"]')!.click());
 await act(async()=>root.unmount());root=createRoot(host);await mount();expect(host.querySelector<HTMLInputElement>('[name="price"]')!.value).toBe("");expect(host.querySelector<HTMLInputElement>('input[type="checkbox"][value="t"]')!.checked).toBe(true);expect(m.plan).not.toHaveBeenCalled();
});
