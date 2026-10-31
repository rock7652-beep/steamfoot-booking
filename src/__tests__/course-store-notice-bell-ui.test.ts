// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),mark:vi.fn(),target:vi.fn(),digitalMark:vi.fn(),push:vi.fn()}));
vi.mock("@/server/actions/course-store-notices",()=>({loadCourseStoreNotices:m.load,markCourseStoreNotice:m.mark,loadCourseStoreNoticeTarget:m.target}));
vi.mock("@/server/actions/course-digital-manager-notices",()=>({loadCombinedCourseStoreNotices:m.load,markCourseDigitalManagerNotice:m.digitalMark}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:m.push}),usePathname:()=>"/s/s/admin/dashboard/courses"}));
vi.mock("next/dynamic",()=>({default:()=> (props:{sessionId:string})=>createElement("div",{"data-testid":"notice-course"},props.sessionId)}));
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
 await click("數位管家｜門市提醒，1 筆待處理");
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
const expand=async()=>{const details=[...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(b=>b.textContent?.includes("驗收學員甲"));await act(async()=>details!.click());};
it("opens the authoritative course without navigation or marking the notice and returns to the same row",async()=>{
 m.load.mockResolvedValue(response([{...row,canViewCourse:true}]));await click("數位管家｜門市提醒，1 筆待處理");await expand();
 const read=deferred();m.target.mockReturnValueOnce(read.promise);const url=window.location.href;
 await click("查看課程");expect(document.body.textContent).toContain("課程詳情");expect(document.body.textContent).toContain("讀取中…");
 await act(async()=>read.resolve({success:true,storeId:"s",data:{id:"current-session",courseName:"目前課程",startsAt:row.startsAt}}));
 expect(document.querySelector('[data-testid="notice-course"]')?.textContent).toBe("current-session");
 expect(m.target).toHaveBeenCalledWith({storeId:"s",id:"n"});expect(m.mark).not.toHaveBeenCalled();expect(window.location.href).toBe(url);
 await click("返回通知");expect(document.querySelector('[data-testid="notice-course"]')).toBeNull();expect(button("查看課程")).toBeTruthy();
});
it("ignores a late course response after closing and keeps target failures inside the course panel",async()=>{
 m.load.mockResolvedValue(response([{...row,canViewCourse:true}]));await click("數位管家｜門市提醒，1 筆待處理");await expand();
 const read=deferred();m.target.mockReturnValueOnce(read.promise);await click("查看課程");await click("返回通知");
 await act(async()=>read.resolve({success:true,storeId:"s",data:{id:"old",courseName:"old",startsAt:row.startsAt}}));expect(document.querySelector('[data-testid="notice-course"]')).toBeNull();
 m.target.mockResolvedValue({success:false,error:"對應課程已不存在"});await click("查看課程");
 expect(document.querySelector('[role="alert"]')?.textContent).toContain("對應課程已不存在");expect(document.querySelector('[data-testid="notice-course"]')).toBeNull();expect(m.mark).not.toHaveBeenCalled();
});

it("preserves the course-specific restore label in the shared notice presentation",async()=>{
 m.load.mockResolvedValue(response([{...row,kind:"RESTORE"}]));
 await act(async()=>window.dispatchEvent(new Event("focus")));
 expect(document.body.textContent).toContain("恢復上課");
});
it("shows payment notices in the same bell and opens the store's pending-payment page",async()=>{
 m.load.mockResolvedValue(response([{...row,id:"digital:p",kind:"PAYMENT",customerName:"方案付款",courseName:"請至待核帳清單查看",coachName:"",canViewCourse:true}]));
 await click("數位管家｜門市提醒，1 筆待處理");
 const detail=[...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(b=>b.textContent?.includes("方案付款"));
 await act(async()=>detail!.click());
 await click("查看待核帳");
 expect(m.push).toHaveBeenCalledWith("/s/s/admin/dashboard/revenue?status=PENDING");
 expect(m.target).not.toHaveBeenCalled();
});
it("marks and restores a payment notice using its store-scoped digital identifier",async()=>{
 m.load.mockResolvedValue(response([{...row,id:"digital:p",kind:"PAYMENT",customerName:"方案付款",coachName:""}]));
 m.digitalMark.mockResolvedValue({success:true,storeId:"s",data:{id:"p",revision:1,handledAt:"2026-10-30T03:00:00Z",handledByName:"店員"}});
 await click("數位管家｜門市提醒，1 筆待處理");await click("標記已處理：方案付款");
 expect(m.digitalMark).toHaveBeenCalledWith({storeId:"s",id:"p",handled:true,revision:0});
 await click("復原");
 expect(m.digitalMark).toHaveBeenLastCalledWith({storeId:"s",id:"p",handled:false,revision:1});
 expect(m.mark).not.toHaveBeenCalled();
});
