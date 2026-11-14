// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({summary:vi.fn()}));
vi.mock("@/lib/customer-panel-summary-read",()=>({readCustomerPanelSummary:m.summary}));
vi.mock("@/server/actions/transaction",()=>({confirmTransactionPayment:vi.fn()}));
vi.mock("@/components/admin/settings-panel-context",()=>({useSettingsPanelGuard:()=>{}}));
import {CustomerPanelSummaryView} from "@/app/(dashboard)/dashboard/customers/_components/customer-panel-summary";
import type {CustomerPanelSummary} from "@/server/actions/customer-panel-summary";
const summary=(label:string):CustomerPanelSummary=>({next:null,pending:[{id:label,walletId:null,label,amount:100,method:"CASH"}],canConfirm:false,healthEnabled:false,health:null});
let root:Root,host:HTMLDivElement;
async function render(customerId="a",revision=0,initialData?:CustomerPanelSummary){await act(async()=>root.render(React.createElement(CustomerPanelSummaryView,{customerId,revision,initialData,readOnly:false,onMutated:vi.fn()})));}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);m.summary.mockReset();host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();vi.useRealTimers();});
it("shows loading until a delayed summary resolves and supports retry after failure",async()=>{
 let resolve!:(value:unknown)=>void;m.summary.mockReturnValue(new Promise(done=>{resolve=done;}));await render();
 expect(host.querySelector('[role="status"]')).not.toBeNull();
 await act(async()=>resolve({success:false,error:"暫時失敗"}));
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("暫時失敗");
 m.summary.mockResolvedValue({success:true,data:summary("correct")});
 await act(async()=>host.querySelector("button")!.click());
 expect(host.textContent).toContain("correct");expect(host.querySelector('[role="status"]')).toBeNull();
});
it("isolates a late result after switching customers",async()=>{
 let resolve!:(value:unknown)=>void;m.summary.mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce({success:true,data:summary("B only")});
 await render("a");await render("b");await act(async()=>resolve({success:true,data:summary("A late")}));
 expect(host.textContent).toContain("B only");expect(host.textContent).not.toContain("A late");
});
it("uses preloaded summary initially but re-reads it after a mutation",async()=>{
 const initial=summary("old");await render("a",0,initial);expect(m.summary).not.toHaveBeenCalled();
 m.summary.mockResolvedValue({success:true,data:summary("updated")});await render("a",1,initial);
 expect(m.summary).toHaveBeenCalledWith("a",expect.any(AbortSignal));expect(host.textContent).toContain("updated");expect(host.textContent).not.toContain("old");
});

it("times out the summary independently and aborts the read so it can be retried",async()=>{
 vi.useFakeTimers();m.summary.mockReturnValue(new Promise(()=>{}));await render();
 const signal=m.summary.mock.calls[0][1] as AbortSignal;
 await act(async()=>vi.advanceTimersByTime(15_000));
 expect(signal.aborted).toBe(true);expect(host.textContent).toContain("摘要暫時無法載入");
 expect(host.querySelector("button")?.textContent).toBe("重新載入摘要");
});

it("updates the separated health navigation after an asynchronously loaded summary",async()=>{
 let finish!:(value:unknown)=>void;
 m.summary.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const onHealthEnabled=vi.fn();
 await act(async()=>root.render(React.createElement(CustomerPanelSummaryView,{customerId:"a",revision:0,readOnly:false,onMutated:vi.fn(),onHealthEnabled,section:"overview"})));
 expect(onHealthEnabled).not.toHaveBeenCalled();
 await act(async()=>finish({success:true,data:{...summary("ready"),healthEnabled:true}}));
 expect(onHealthEnabled).toHaveBeenLastCalledWith(true);
 expect(host.textContent).not.toContain("健康資料");
});
