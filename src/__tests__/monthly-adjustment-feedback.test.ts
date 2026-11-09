// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import type {MonthlyAdjustmentSnapshot} from "@/lib/staff-monthly-adjustment";
const m=vi.hoisted(()=>({save:vi.fn(),remove:vi.fn(),lock:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/staff-monthly-adjustment",()=>({saveMonthlyAdjustment:m.save,deleteMonthlyAdjustment:m.remove,changeAdjustmentMonthLock:m.lock}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/components/admin/modal-panel",()=>({ModalPanel:({open,children}:{open:boolean;children:React.ReactNode})=>open?children:null}));
import {MonthlyAdjustments} from "@/app/(dashboard)/dashboard/service-fee-calculator/monthly-adjustments";
import {MonthlyAdjustmentProvider,useAdjustmentReportLines,useMonthlyAdjustmentState} from "@/components/operations/monthly-adjustment-context";
import {SteamfootAdjustmentSummary} from "@/app/(dashboard)/dashboard/service-fee-calculator/steamfoot-adjustment-summary";
const person={id:"s1",name:"測試技師",active:true};
const row={id:"a3407c3e-4ed7-4b85-8a09-5aa4cb5ecdfa",month:"2026-11",date:"2026-11-04",staffId:"s1",direction:"ADD" as const,amount:100,reason:"原獎勵",revision:1};
let root:Root,host:HTMLDivElement;
const initial=():MonthlyAdjustmentSnapshot=>({storeId:"A",month:"2026-11",rows:[row],locked:false,revision:1});
function Report(){const lines=useAdjustmentReportLines([]),state=useMonthlyAdjustmentState()!;return React.createElement("output",{"data-report":true},`${lines.reduce((n,l)=>n+(l.amount??0),0)}:${state.syncing?"同步中":"已同步"}`);}
function tree(snapshot:MonthlyAdjustmentSnapshot){return React.createElement(MonthlyAdjustmentProvider,{initial:snapshot,people:[person]},React.createElement(React.Fragment,null,React.createElement(Report),React.createElement(SteamfootAdjustmentSummary,{people:[{id:person.id,name:person.name,amount:800,needsReview:false}]}),React.createElement(MonthlyAdjustments,{storeId:snapshot.storeId,month:snapshot.month,rows:snapshot.rows,locked:snapshot.locked,revision:snapshot.revision,people:[person],canEdit:true,confirmInReport:true})));}
const button=(text:string)=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent===text)!;
async function click(text:string){await act(async()=>button(text).click());}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(tree(initial())));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("updates the saved row and both report totals from the server receipt before any route refresh",async()=>{
 let finish!:(result:unknown)=>void;m.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await click("編輯");await submit();
 expect(host.textContent).not.toContain("已儲存");expect(host.querySelector("form")).not.toBeNull();
 await act(async()=>finish({success:true,data:{...initial(),revision:2,rows:[{...row,amount:250,reason:"後端已確認",revision:2}]}}));
 expect(host.querySelector("form")).toBeNull();expect(host.textContent).toContain("後端已確認");
 expect(host.querySelector("output")!.textContent).toBe("250:同步中");expect(host.textContent).toContain("NT$ 1,050");
 expect(m.refresh).toHaveBeenCalledOnce();expect(m.save.mock.calls[0][0]).toMatchObject({viewMonth:"2026-11",expectedStoreId:"A"});
 // A delayed older RSC payload cannot bring back the old amount or row.
 await act(async()=>root.render(tree({...initial(),rows:[{...row,amount:1}]})));
 expect(host.querySelector("output")!.textContent).toBe("250:同步中");
 await act(async()=>root.render(tree({...initial(),revision:3,rows:[{...row,amount:500,revision:3}]})));
 expect(host.querySelector("output")!.textContent).toBe("500:已同步");
});
it("keeps the original row and draft when saving fails",async()=>{
 m.save.mockResolvedValue({success:false,error:"明細已被修改"});await click("編輯");await submit();
 expect(host.querySelector("form")).not.toBeNull();expect(host.textContent).toContain("明細已被修改");
 expect(host.querySelector("output")!.textContent).toBe("100:已同步");expect(m.refresh).not.toHaveBeenCalled();
});
it("removes a confirmed deletion without reloading the route",async()=>{
 m.remove.mockResolvedValue({success:true,data:{...initial(),revision:2,rows:[]}});await click("刪除");await click("確認刪除");
 expect(host.textContent).not.toContain("原獎勵");expect(host.querySelector("output")!.textContent).toBe("0:同步中");expect(host.textContent).toContain("NT$ 800");
});
it("uses the viewed month receipt when moving a row to another month",async()=>{
 m.save.mockResolvedValue({success:true,data:{...initial(),revision:2,rows:[]}});await click("編輯");await submit();
 expect(host.textContent).toContain("本月尚無調整紀錄");expect(host.querySelector("output")!.textContent).toBe("0:同步中");
});
it("does not apply a receipt for another store or month",async()=>{
 m.save.mockResolvedValue({success:true,data:{...initial(),storeId:"B",revision:20,rows:[]}});await click("編輯");await submit();
 expect(host.querySelector("output")!.textContent).toBe("100:已同步");expect(host.querySelector("form")).not.toBeNull();expect(host.textContent).toContain("正在同步明細");
});
