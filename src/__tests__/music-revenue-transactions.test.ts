// @vitest-environment jsdom
import {act,createElement,useState} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import type {Column} from "@/components/desktop";
import type {RevenueTransactions} from "@/server/queries/music-revenue-transactions";
const m=vi.hoisted(()=>({reader:{read:vi.fn(),invalidate:vi.fn()},signal:()=>{}}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>m.reader}));
vi.mock("@/lib/music-finance-sync",()=>({subscribeMusicFinanceChange:(fn:()=>void)=>{m.signal=fn;return()=>{};}}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions",()=>({CourseTransactionActions:({order}:{order:{id:string}})=>{const [draft]=useState("保留草稿");return createElement("input",{defaultValue:draft,"data-order":order.id});}}));
vi.mock("@/components/desktop",()=>({EmptyRow:()=>null,DataTable:<Row extends {id:string}>({rows,columns}:{rows:Row[];columns:Column<Row>[]})=>createElement("div",null,rows.map((r,index)=>createElement("div",{key:r.id},columns.map(c=>createElement("span",{key:c.key},c.accessor(r,index))))))}));
import {CourseRevenueTransactions} from "@/app/(dashboard)/dashboard/revenue/_components/course-revenue-transactions";
it("updates authoritative rows in place, preserves the draft and ignores older responses",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div"),root=createRoot(host);
 const data=(price:number):RevenueTransactions=>({count:1,page:1,pages:1,rows:[{
  id:"same",storeId:"synthetic",customerId:"learner",planId:"plan",name:"方案商品1期",
  date:"2026/10/16",customerName:"測試學員",unit:"SESSION",points:8,remaining:2,price,status:"CONFIRMED",
  musicTermSizes:[4,4],musicBonusLessons:0,musicManualBonus:0,musicJoinSessionId:null,
  sportsMode:"LEGACY",sportsSubjectId:null,sportsCost:null,termSessionIds:[],templateIds:[],validDays:70,
  transferLastFive:"",transferLastFour:null,requestKey:"fixture",cardId:"card",note:"",
  createdAt:new Date("2026-10-16T00:00:00Z"),confirmedAt:new Date("2026-10-16T00:00:00Z"),confirmedBy:null,
  voidedAt:null,voidedBy:null,voidReason:null,revenueStaffId:null,
  listPrice:6400,discountKind:null,discountValue:null,paymentMethod:"CASH",
  storeCostSnapshot:null,developerProfitSnapshot:null,developerNameSnapshot:null,
  refunds:[],tuitionDue:3200,tuitionReceipts:[],reserved:0,attended:0,usedQuota:0,expiresAt:null,
 }]});
 const resolve:Array<(v:unknown)=>void>=[];m.reader.read.mockImplementation(()=>new Promise(r=>resolve.push(r)));
 try{
 await act(async()=>root.render(createElement(CourseRevenueTransactions,{initial:data(0),input:{from:"2026-10-01",to:"2026-10-16",status:"CONFIRMED",dataScope:"operational",page:"2"},staffRows:[],basePath:"/dashboard/revenue",live:true,canRefund:false,canConfirm:false,canEdit:false,canVoid:false})));
 const draft=host.querySelector("input")!;draft.value="正在編輯";
 expect(host.textContent).toContain("購買 2 期・共 8 堂");expect(host.textContent).toContain("方案商品1期");
 await act(async()=>m.signal());await act(async()=>m.signal());
 expect(m.reader.read).toHaveBeenLastCalledWith(expect.objectContaining({status:"CONFIRMED",dataScope:"operational",page:"2"}));
 await act(async()=>resolve[1]({success:true,data:data(3200)}));
 expect(host.textContent).toContain("NT$ 3,200");expect(host.textContent).toContain("未收 NT$ 0");
 await act(async()=>resolve[0]({success:true,data:data(1000)}));
 expect(host.textContent).toContain("未收 NT$ 0");expect(host.querySelector("input")).toBe(draft);expect(draft.value).toBe("正在編輯");
 }finally{await act(async()=>root.unmount());}
});
