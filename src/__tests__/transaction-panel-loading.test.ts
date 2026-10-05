// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({read: vi.fn(), note: vi.fn(), refresh: vi.fn()}));
vi.mock("@/server/actions/transaction", () => ({fetchTransactionDetailDTO:m.read, updateTransactionNote:m.note, updateTransactionPaymentMethod:vi.fn(), updateTransactionOwnerStaff:vi.fn(), voidTransaction:vi.fn(), refundTransaction:vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh:m.refresh})}));
vi.mock("@/components/admin/right-sheet", () => ({RightSheet: ({open,children}: {open:boolean;children: React.ReactNode}) => open ? React.createElement("div", {role:"dialog"}, children) : null}));
import { TransactionDrawer } from "@/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer";
import { TransactionRowActions } from "@/app/(dashboard)/dashboard/transactions/_components/TransactionRowActions";
import { PanelReadProvider } from "@/components/operations/panel-read-cache";
let host: HTMLDivElement, root: Root;
function payload(id:string) {return {success:true, data:{id,customerName:`customer-${id}`,amount:350,paymentMethod:"CASH",revenueStaffId:"staff",revenueStaffName:"staff",createdAt:"2026-10-04T00:00:00Z",transactionType:"TRIAL_PURCHASE",status:"SUCCESS",note:"test",paymentSplits:[],auditLogs:[]}};}
function deferred<T>() {let resolve!:(value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;});return {resolve,promise};}
beforeEach(() => {vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");root=createRoot(host);m.read.mockImplementation(async id=>payload(id));});
afterEach(async () => {await act(async()=>root.unmount());});
async function render(id:string) {await act(async()=>root.render(React.createElement(TransactionDrawer,{open:true,onClose:vi.fn(),transactionId:id,staffOptions:[],canEdit:true,canVoid:false,canRefund:false})));}
async function click(text:string) {await act(async()=>{Array.from(host.querySelectorAll("button")).find(b=>b.textContent?.trim()===text)!.click();});}
it("does not apply a mutation response from the previous transaction",async()=>{
 const mutation=deferred<{success:boolean}>();m.note.mockReturnValue(mutation.promise);
 await render("a");await click("修改");await click("儲存");
 await render("b");await act(async()=>mutation.resolve({success:true}));
 expect(host.textContent).toContain("customer-b");expect(host.textContent).not.toContain("customer-a");
 expect(m.read).toHaveBeenCalledTimes(2);expect(m.refresh).toHaveBeenCalled();
});
it("does not let a late post-mutation read replace another transaction",async()=>{
 const refresh=deferred<ReturnType<typeof payload>>();m.note.mockResolvedValue({success:true});
 await render("a");m.read.mockReturnValueOnce(refresh.promise);await click("修改");await click("儲存");
 await render("b");await act(async()=>refresh.resolve(payload("a")));
 expect(host.textContent).toContain("customer-b");expect(host.textContent).not.toContain("customer-a");
});
it("shows a recoverable error after a rejected detail read",async()=>{
 m.read.mockRejectedValueOnce(new Error("offline"));await render("a");
 expect(host.textContent).toContain("載入失敗，請重試");expect(host.textContent).not.toContain("載入中…");
 await click("重新載入");
 expect(host.textContent).toContain("customer-a");expect(host.querySelector('[role="alert"]')).toBeNull();
 expect(m.read).toHaveBeenCalledTimes(2);
});

it("does not display or offer edits for the old transaction while the new read is pending",async()=>{
 await render("a");const next=deferred<ReturnType<typeof payload>>();m.read.mockReturnValueOnce(next.promise);
 await render("b");expect(host.textContent).not.toContain("customer-a");expect(host.querySelector("textarea")).toBeNull();
 await act(async()=>next.resolve(payload("b")));expect(host.textContent).toContain("customer-b");
});

async function renderRow() {
 await act(async()=>root.render(React.createElement(PanelReadProvider, null,
  React.createElement(TransactionRowActions,{transactionId:"a",staffOptions:[],canEdit:true,canVoid:false,canRefund:false}))));
}
it.each(["pointerover", "focusin", "touchstart"])("shares in-flight %s intent with opening, but does not reuse completed financial data",async(event)=>{
 const first=deferred<ReturnType<typeof payload>>();m.read.mockReturnValueOnce(first.promise);
 await renderRow();expect(m.read).not.toHaveBeenCalled();
 await act(async()=>host.querySelector("button")!.dispatchEvent(new Event(event,{bubbles:true})));
 expect(m.read).toHaveBeenCalledTimes(1);expect(host.querySelector('[role="dialog"]')).toBeNull();
 await click("⋯");expect(m.read).toHaveBeenCalledTimes(1);
 expect(host.textContent).toContain("載入中…");expect(host.querySelector("textarea")).toBeNull();
 await act(async()=>first.resolve(payload("a")));expect(host.textContent).toContain("customer-a");
 await click("✕");await click("⋯");expect(m.read).toHaveBeenCalledTimes(2);
 expect(m.note).not.toHaveBeenCalled();
});
it("retries a server error in place and ignores that retry after switching transactions",async()=>{
 m.read.mockResolvedValueOnce({success:false,error:"無法讀取"});await render("a");
 expect(host.textContent).toContain("無法讀取");
 const retry=deferred<ReturnType<typeof payload>>();m.read.mockReturnValueOnce(retry.promise);
 await click("重新載入");await render("b");
 await act(async()=>retry.resolve(payload("a")));
 expect(host.textContent).toContain("customer-b");expect(host.textContent).not.toContain("customer-a");
});
it("a failed intent preload does not prevent opening and reading again",async()=>{
 m.read.mockRejectedValueOnce(new Error("offline"));await renderRow();
 await act(async()=>host.querySelector("button")!.dispatchEvent(new Event("touchstart",{bubbles:true})));
 await click("⋯");expect(host.textContent).toContain("customer-a");expect(m.read).toHaveBeenCalledTimes(2);
});
