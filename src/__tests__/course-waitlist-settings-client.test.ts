// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/s/a/admin/dashboard/courses"}));
import {CourseWaitlistSettings} from "@/app/(dashboard)/dashboard/courses/course-waitlist-settings";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it("confirms waitlist status locally and preserves the exact uncertain attempt",async()=>{
 const fetch=vi.fn(),onSaved=vi.fn();vi.stubGlobal("fetch",fetch);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const initial={enabled:false,defaultLimit:5,autoPromoteStopMinutes:240};
 try{
  await act(async()=>root.render(createElement(CourseWaitlistSettings,{initial,storeId:"store",canEdit:true,onSaved})));
  await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  fetch.mockRejectedValueOnce(new Error("lost response"));
  await act(async()=>{host.querySelector<HTMLButtonElement>("button")!.click();host.querySelector<HTMLButtonElement>("button")!.click();});
  expect(fetch).toHaveBeenCalledTimes(1);expect(onSaved).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
  fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"store",data:{...initial,enabled:true}})});
  await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);expect(fetch.mock.calls[1][0]).toBe("/s/a/admin/dashboard/settings-save/course/waitlist");
  expect(onSaved).toHaveBeenCalledWith({...initial,enabled:true});expect(host.textContent).toContain("已儲存");expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
