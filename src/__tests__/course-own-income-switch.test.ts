// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("@/server/actions/course-own-income-access",()=>({saveCourseOwnIncomeAccess:m.save}));
import {CourseOwnIncomeSwitch} from "@/components/admin/course-own-income-switch";
let root:Root,host:HTMLDivElement;
const saved=vi.fn(),guard=vi.fn();
beforeEach(()=>{
 vi.resetAllMocks();
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(props:Partial<Parameters<typeof CourseOwnIncomeSwitch>[0]>={}){
 await act(async()=>root.render(createElement(CourseOwnIncomeSwitch,{storeId:"store-a",staffId:"teacher-a",initialEnabled:false,canEdit:true,blocked:false,storeEnabled:true,onSaved:saved,onPendingChange:guard,...props})));
}
it("defaults off, acknowledges a successful grant and retains the same editor",async()=>{
 m.save.mockResolvedValue({success:true,data:{enabled:true,updatedAt:"2026-10-11T00:00:00Z"}});
 await render();
 const button=host.querySelector<HTMLButtonElement>('[role="switch"]')!;
 expect(button.getAttribute("aria-checked")).toBe("false");
 await act(async()=>button.click());
 expect(m.save).toHaveBeenCalledWith({storeId:"store-a",staffId:"teacher-a",previous:false,enabled:true});
 expect(button.getAttribute("aria-checked")).toBe("true");expect(saved).toHaveBeenCalledOnce();
 expect(guard.mock.calls.map(c=>c[0])).toEqual([true,false]);expect(host.querySelector("a")).toBeNull();
});
it("prevents duplicate submissions while pending and restores the switch on failure",async()=>{
 let finish!:(value:unknown)=>void;m.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await render();const button=host.querySelector<HTMLButtonElement>('[role="switch"]')!;
 await act(async()=>{button.click();button.click();});
 expect(m.save).toHaveBeenCalledOnce();expect(button.disabled).toBe(true);expect(button.getAttribute("aria-checked")).toBe("true");
 await act(async()=>finish({success:false,error:"只有老闆能設定"}));
 expect(button.getAttribute("aria-checked")).toBe("false");expect(button.disabled).toBe(false);
 expect(host.querySelector('[role="alert"]')?.textContent).toBe("只有老闆能設定");expect(saved).not.toHaveBeenCalled();
});
it("renders the grant read-only for non-owners",async()=>{
 await render({canEdit:false});expect((host.querySelector('[role="switch"]') as HTMLInputElement).disabled).toBe(true);
 expect(host.textContent).toContain("僅老闆可修改");expect(m.save).not.toHaveBeenCalled();
});
it("allows advance authorization before LINE binding and uses the teacher heading",async()=>{
 m.save.mockResolvedValue({success:true,data:{enabled:true,updatedAt:"2026-10-11T00:00:00Z"}});
 await render({music:true,lineBound:false});
 expect(host.querySelector("h3")?.textContent).toBe("教師權限");
 const control=host.querySelector<HTMLInputElement>('[role="switch"]')!;
 expect(control.type).toBe("checkbox");expect(control.disabled).toBe(false);
 await act(async()=>control.click());
 expect(control.checked).toBe(true);expect(host.textContent).toContain("待綁定 LINE");
 expect(host.querySelector('[role="status"]')?.textContent).toBe("已儲存 ✓");
 expect(m.save).toHaveBeenCalledOnce();
});
it("does not change a grant while other teacher data is unsaved",async()=>{
 await render({blocked:true});const button=host.querySelector<HTMLButtonElement>('[role="switch"]')!;
 button.click();expect(button.disabled).toBe(true);expect(m.save).not.toHaveBeenCalled();
});
it("makes the existing store-wide prerequisite visible without automatically enabling it",async()=>{
 await render({initialEnabled:true,storeEnabled:false});expect(host.textContent).toContain("門市尚未開放本人收入查詢");expect(m.save).not.toHaveBeenCalled();
});
