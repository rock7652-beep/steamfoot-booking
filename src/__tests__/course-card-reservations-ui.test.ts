// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const load=vi.hoisted(()=>vi.fn());
vi.mock("@/server/actions/course-card-reservations",()=>({loadCourseCardReservations:load}));
import {CourseCardReservations} from "@/app/(dashboard)/dashboard/courses/card-reservations";
it("loads only when expanded, displays shared learner and preserves point units",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});load.mockResolvedValue({success:true,scoped:false,hasMore:false,rows:[{id:"b",name:"瑜珈",customerName:"共卡學員",startsAt:"2026-10-01T01:00:00Z",amount:3}]});
 const host=document.createElement("div");const root=createRoot(host);
 try{await act(async()=>root.render(createElement(CourseCardReservations,{cardId:"card",held:3,unit:"POINT"})));expect(load).not.toHaveBeenCalled();await act(async()=>host.querySelector("button")!.click());expect(load).toHaveBeenCalledWith({cardId:"card",page:0});expect(host.textContent).toContain("共卡學員 · 3 點");expect(host.textContent).toContain("瑜珈");expect(host.textContent).not.toContain("3 堂");}finally{await act(async()=>root.unmount());}
});
