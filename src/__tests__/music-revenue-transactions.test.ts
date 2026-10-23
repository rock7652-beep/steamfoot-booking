// @vitest-environment jsdom
import {act,createElement,useState} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({reader:{read:vi.fn(),invalidate:vi.fn()},signal:()=>{}}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>m.reader}));
vi.mock("@/lib/music-finance-sync",()=>({subscribeMusicFinanceChange:(fn:()=>void)=>{m.signal=fn;return()=>{};}}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions",()=>({CourseTransactionActions:({order}:any)=>{const [draft]=useState("保留草稿");return createElement("input",{defaultValue:draft,"data-order":order.id});}}));
vi.mock("@/components/desktop",()=>({EmptyRow:()=>null,DataTable:({rows,columns}:any)=>createElement("div",null,rows.map((r:any)=>createElement("div",{key:r.id},columns.map((c:any)=>createElement("span",{key:c.key},c.accessor(r))))))}));
import {CourseRevenueTransactions} from "@/app/(dashboard)/dashboard/revenue/_components/course-revenue-transactions";
it("updates authoritative rows in place, preserves the draft and ignores older responses",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div"),root=createRoot(host);
 const data=(price:number)=>({count:1,page:1,pages:1,rows:[{id:"same",date:"2026/10/16",customerName:"測試學員",name:"方案",price,status:"CONFIRMED",refunds:[],tuitionDue:3200,storeCostSnapshot:null}]}) as any;
 const resolve:Array<(v:unknown)=>void>=[];m.reader.read.mockImplementation(()=>new Promise(r=>resolve.push(r)));
 try{
 await act(async()=>root.render(createElement(CourseRevenueTransactions,{initial:data(0),input:{from:"2026-10-01",to:"2026-10-16",status:"CONFIRMED",dataScope:"operational",page:"2"},staffRows:[],basePath:"/dashboard/revenue",live:true,canRefund:false,canConfirm:false,canEdit:false,canVoid:false})));
 const draft=host.querySelector("input")!;draft.value="正在編輯";
 await act(async()=>m.signal());await act(async()=>m.signal());
 expect(m.reader.read).toHaveBeenLastCalledWith(expect.objectContaining({status:"CONFIRMED",dataScope:"operational",page:"2"}));
 await act(async()=>resolve[1]({success:true,data:data(3200)}));
 expect(host.textContent).toContain("NT$ 3,200");expect(host.textContent).toContain("未收 NT$ 0");
 await act(async()=>resolve[0]({success:true,data:data(1000)}));
 expect(host.textContent).toContain("未收 NT$ 0");expect(host.querySelector("input")).toBe(draft);expect(draft.value).toBe("正在編輯");
 }finally{await act(async()=>root.unmount());}
});
