// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),close:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>m,usePathname:()=>"/hq/dashboard/courses",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/components/admin/use-settings-save",()=>({useSettingsSave:()=>({save:m.save,uncertain:false})}));
import {CourseSelfBookingSettings} from "@/app/(dashboard)/dashboard/courses/course-self-booking-settings";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(canEdit=true){await act(async()=>root.render(createElement(CourseSelfBookingSettings,{storeId:'test',music:true,initialEnabled:false,initialRevision:3,canEdit,expanded:false,onEdit:vi.fn(),onClose:m.close})));}
it('saves the requested switch value with the current revision and displays confirmed state',async()=>{
 m.save.mockResolvedValue({success:true,data:{enabled:true,revision:4}});await render();
 await act(async()=>host.querySelector<HTMLInputElement>('[role="switch"]')!.click());
 expect(m.save).toHaveBeenCalledExactlyOnceWith({enabled:true,expectedRevision:3});expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(true);expect(host.textContent).toContain('開啟');expect(host.textContent).not.toContain('修改');
});
it('retains confirmed state when persistence fails and respects edit permission',async()=>{
 m.save.mockResolvedValue({success:false,error:'設定衝突',uncertain:false});await render();await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());
 expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(false);expect(host.querySelector('[role="alert"]')?.textContent).toBe('設定衝突');
 await render(false);expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
});
