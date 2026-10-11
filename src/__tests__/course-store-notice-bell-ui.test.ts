// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),mark:vi.fn()}));
vi.mock("@/server/actions/course-store-notices",()=>({loadCourseStoreNotices:m.load,markCourseStoreNotice:m.mark}));
import {CourseStoreNoticeBell} from "@/components/admin/course-store-notice-bell";
let host:HTMLDivElement,root:Root;
const row={id:"n",kind:"LEAVE",customerName:"驗收學員甲",courseName:"吉他課",coachName:"驗收教師",previousCoachName:null,startsAt:"2026-10-15T02:00:00Z",previousStartsAt:null,affectedCount:1,details:{},handledAt:null,handledById:null,handledByName:null,revision:0,createdAt:"2026-10-11T02:00:00Z",updatedAt:"2026-10-11T02:00:00Z"};
const response=(items:unknown[],count=1)=>({success:true,storeId:"s",enabled:true,items,count,canHandle:true,more:false});
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.getAttribute("aria-label")===label||b.textContent===label)!;
const click=async(label:string)=>{expect(button(label)).toBeTruthy();await act(async()=>button(label).click());};
const deferred=()=>{let resolve!:(value:unknown)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
beforeEach(async()=>{
 vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 m.load.mockResolvedValue(response([row]));
 m.mark.mockResolvedValue({success:true,storeId:"s",data:{id:"n",revision:1,handledAt:"2026-10-11T03:00:00Z",handledByName:"值班人員"}});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(CourseStoreNoticeBell,{storeId:"s"})));
 await click("門市通知，1 筆待處理");
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("does not report an empty handled list while the saved notice is being fetched",async()=>{
 m.load.mockResolvedValue(response([],0));await click("標記已處理：驗收學員甲");
 const read=deferred();m.load.mockReturnValueOnce(read.promise);await click("已處理");
 expect(document.body.textContent).toContain("讀取中…");
 expect(document.body.textContent).not.toContain("尚無已處理通知");
 await act(async()=>read.resolve(response([{...row,handledAt:"2026-10-11T03:00:00Z",handledByName:"值班人員",revision:1}],0)));
 expect(button("恢復待處理：驗收學員甲")).toBeTruthy();
 const details=[...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(b=>b.textContent?.includes("驗收學員甲"));
 expect(details).toBeTruthy();await act(async()=>details!.click());
 expect(document.body.textContent).toContain("值班人員");
});
it("does not display pending rows under the handled tab during a slow read",async()=>{
 const read=deferred();m.load.mockReturnValueOnce(read.promise);await click("已處理");
 expect(document.body.textContent).not.toContain("驗收學員甲");
 expect(document.body.textContent).toContain("讀取中…");
 await act(async()=>read.resolve(response([],1)));
 expect(document.body.textContent).toContain("尚無已處理通知");
});
it("shows a failed handled read as an error, not as an empty result",async()=>{
 const read=deferred();m.load.mockReturnValueOnce(read.promise);await click("已處理");
 await act(async()=>read.resolve({success:false,error:"通知更新失敗，請重試"}));
 expect(document.querySelector('[role="alert"]')?.textContent).toContain("通知更新失敗");
 expect(document.body.textContent).not.toContain("尚無已處理通知");
});
