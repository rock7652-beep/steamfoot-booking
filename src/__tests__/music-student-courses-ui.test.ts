// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({periods:{read:vi.fn(),invalidate:vi.fn()},orders:{read:vi.fn(),clear:vi.fn()}}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:(name:string)=>name==="music-periods"?mock.periods:mock.orders}));
vi.mock("@/server/actions/music-periods",()=>({loadMusicPeriods:vi.fn()}));
vi.mock("@/server/actions/course-customer-history",()=>({loadCourseCustomerPurchases:vi.fn()}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({href,children}:{href:string;children:never})=>createElement("a",{href},children)}));
vi.mock("@/components/admin/modal-panel",()=>({ModalPanel:({open,children}:{open:boolean;children:never})=>open?createElement("div",{role:"dialog"},children):null}));
vi.mock("@/app/(dashboard)/dashboard/courses/music-period-overview",()=>({MusicPeriodOverview:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/music-tuition-details",()=>({MusicTuitionDetails:({receiptPeriod}:{receiptPeriod?:number})=>createElement("button",null,receiptPeriod?"補登收款":"⋯")}));
import {MusicStudentCourses} from "@/app/(dashboard)/dashboard/courses/music-student-courses";
const cards=[{id:"guitar-card",planId:"guitar-plan",templateIds:["guitar"],nameSnapshot:"個別課",musicTermSizes:[2,2],musicBonusLessons:0,slots:[{period:1,ordinal:1},{period:1,ordinal:2},{period:2,ordinal:1},{period:2,ordinal:2}],bookings:[{id:"booking",date:"2026-10-23T08:00:00Z",sessionId:"class",teacher:"教師甲",status:"ATTENDED",assignment:{period:1,ordinal:2}}]},{id:"piano-card",planId:"piano-plan",templateIds:["piano"],nameSnapshot:"鋼琴個別課",musicTermSizes:[1],musicBonusLessons:0,slots:[{period:1,ordinal:1}],bookings:[]}];
const orders=[{id:"purchase",cardId:"guitar-card",planId:"guitar-plan",templateIds:["guitar"],name:"個別課",createdAt:"2026-10-01T00:00:00Z",status:"CONFIRMED",tuition:{periods:[{period:1,due:1600,received:1600,outstanding:0},{period:2,due:1600,received:0,outstanding:1600}],receipts:[{id:"receipt",amount:1600,paidAt:"2026-10-02T00:00:00Z",method:"CASH"}]}}];
let host:HTMLDivElement,root:Root;
const props={customerId:"student-1",templates:[{id:"guitar",name:"吉他"},{id:"piano",name:"鋼琴"}],subjects:[],canReadBookings:true,canReadTransactions:true,canReadCards:true,canAssign:true,onPurchase:vi.fn(),onManageCard:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);mock.periods.read.mockResolvedValue({success:true,data:cards});mock.orders.read.mockResolvedValue({success:true,data:orders,hasMore:false});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("groups by teaching item and charging method, with each period collapsed and its own receipts and dates",async()=>{
 await act(async()=>root.render(createElement(MusicStudentCourses,props)));
 const item=host.querySelector<HTMLSelectElement>('[aria-label="學員教學項目"]')!;expect([...item.options].map(o=>o.text)).toEqual(["請選擇教學項目","吉他","鋼琴"]);
 expect(host.querySelector('[aria-label="收費方式"]')?.textContent).toBe("個別課");
 const periods=host.querySelectorAll<HTMLDetailsElement>('[data-music-period]');expect(periods.length).toBe(2);expect(periods[0].open).toBe(false);expect(periods[0].textContent).toContain("2026-10-02");expect(periods[0].textContent).toContain("教師甲");expect(periods[1].textContent).toContain("尚無本期收款紀錄");
 await act(async()=>{item.value="piano";item.dispatchEvent(new Event("change",{bubbles:true}));});expect(host.querySelector('[aria-label="收費方式"]')?.textContent).toBe("鋼琴個別課");expect(host.textContent).not.toContain("教師甲");
});
it("does not fetch financial history or show lesson data without its own permission",async()=>{
 await act(async()=>root.render(createElement(MusicStudentCourses,{...props,canReadTransactions:false,canReadBookings:false})));
 expect(mock.orders.read).not.toHaveBeenCalled();expect(host.textContent).toContain("收款資料無檢視權限");expect(host.textContent).not.toContain("教師甲");expect(host.textContent).not.toContain("補登收款");
});
it("clears a previous learner while the next request is pending and ignores late responses",async()=>{
 await act(async()=>root.render(createElement(MusicStudentCourses,props)));
 let finish!:(value:unknown)=>void;mock.periods.read.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mock.orders.read.mockResolvedValue({success:true,data:[],hasMore:false});
 await act(async()=>root.render(createElement(MusicStudentCourses,{...props,customerId:"student-2"})));
 expect(host.textContent).not.toContain("教師甲");expect(host.textContent).toContain("讀取課程與學費");
 await act(async()=>finish({success:true,data:[]}));expect(host.textContent).toContain("尚無已購課程");
});
