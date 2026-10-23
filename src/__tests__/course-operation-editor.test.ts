// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),close:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>m,usePathname:()=>"/hq/dashboard/courses",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/server/actions/course-store-notices",()=>({saveCourseOperationSwitch:m.save}));
import {CourseOperationSwitch} from "@/components/admin/course-operation-switch";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(canEdit=true){await act(async()=>root.render(createElement(CourseOperationSwitch,{storeId:"test",setting:"selfLeaveEnabled",title:"允許學員自行請假",initialEnabled:true,canEdit,expanded:true,onEdit:vi.fn(),onClose:m.close})));}
async function toggle(){await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it("keeps a changed checkbox local until save and cancels without changing the saved setting",async()=>{
 await render();await toggle();expect(m.save).not.toHaveBeenCalled();
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='取消')!.click());
 expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(true);expect(m.close).toHaveBeenCalledOnce();expect(m.save).not.toHaveBeenCalled();
});
it("sends the saved comparison value and closes only after confirmed persistence",async()=>{
 m.save.mockResolvedValue({success:true,data:{enabled:false}});await render();await toggle();await submit();
 expect(m.save).toHaveBeenCalledExactlyOnceWith({storeId:"test",key:"selfLeaveEnabled",enabled:false,previous:true});expect(m.close).toHaveBeenCalledOnce();expect(m.refresh).toHaveBeenCalledOnce();expect(host.textContent).toContain('關閉');
});
it("retains the draft on conflict and shows no editor without edit permission",async()=>{
 m.save.mockResolvedValue({success:false,error:"設定已更新"});await render();await toggle();await submit();
 expect(host.querySelector('[role="alert"]')?.textContent).toBe('設定已更新');expect(m.close).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
 await render(false);expect(host.querySelector('input')).toBeNull();expect(host.textContent).toContain('開啟');
});
