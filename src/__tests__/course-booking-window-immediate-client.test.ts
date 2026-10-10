// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/s/a/admin/dashboard/courses",useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/server/actions/shop",()=>({updateBookableUntilDate:vi.fn(),updateCustomerBookingWindow:vi.fn()}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {BookableUntilForm} from "@/app/(dashboard)/dashboard/settings/hours/bookable-until-form";
let root:Root,host:HTMLDivElement;
const props={course:true,direct:true,storeId:"s",initialDate:null,initialDays:14,initialOpensAt:"2026-10-12T00:00:00.000Z",today:"2026-10-10",canManage:true};
beforeEach(async()=>{
 vi.resetAllMocks();vi.stubGlobal("fetch",m.fetch);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(BookableUntilForm,props)));
 await click("修改");
 const select=host.querySelector<HTMLSelectElement>('select[aria-label="自動開放天數"]')!;
 await act(async()=>{select.value="7";select.dispatchEvent(new Event("change",{bubbles:true}));});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function click(text:string){const button=[...host.querySelectorAll("button")].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click());}
it("confirms persisted state without refreshing and sends only once for same-tick clicks",async()=>{
 let finish!:(v:unknown)=>void;m.fetch.mockReturnValue(new Promise(r=>{finish=r;}));
 const button=[...host.querySelectorAll("button")].find(b=>b.textContent==="儲存設定")!;
 await act(async()=>{button.click();button.click();});expect(m.fetch).toHaveBeenCalledTimes(1);
 expect(host.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
 const body=JSON.parse(m.fetch.mock.calls[0][1].body);expect(body.expectedRevision).toBe(JSON.stringify([null,14,props.initialOpensAt]));expect(body.expectedStoreId).toBe("s");
 expect(m.fetch.mock.calls[0][0]).toBe("/s/a/admin/dashboard/settings-save/course/booking-window");
 await act(async()=>finish({json:async()=>({success:true,storeId:"s",data:{date:null,days:7,opensAt:null}})}));
 expect(host.textContent).toContain("未來 7 天");expect(host.querySelector("select")).toBeNull();expect(m.refresh).not.toHaveBeenCalled();
 await act(async()=>root.render(createElement(BookableUntilForm,{...props})));expect(host.textContent).toContain("未來 7 天");
});
it("locks unknown results and retries the identical request rather than allowing another value",async()=>{
 m.fetch.mockRejectedValueOnce(new Error("lost reply"));await click("儲存設定");expect(host.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
 expect([...host.querySelectorAll("button")].find(b=>b.textContent==="取消")!.disabled).toBe(true);expect(host.querySelector('[role="alert"]')!.textContent).toContain("尚未確認");
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:{date:null,days:7,opensAt:null}})});await click("重試確認儲存結果");
 expect(m.fetch.mock.calls[1][1].body).toBe(m.fetch.mock.calls[0][1].body);expect(host.textContent).toContain("未來 7 天");expect(m.refresh).not.toHaveBeenCalled();
});
it("definite conflict keeps the draft editable and never announces it as saved",async()=>{
 m.fetch.mockResolvedValueOnce({json:async()=>({success:false,error:"已有課程預約"})});await click("儲存設定");
 expect(host.textContent).toContain("未來 14 天");expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("7");expect(host.querySelector<HTMLSelectElement>("select")!.disabled).toBe(false);expect(host.querySelector('[role="alert"]')!.textContent).toBe("已有課程預約");
});
