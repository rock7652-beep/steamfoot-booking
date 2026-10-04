// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({read: vi.fn(), note: vi.fn(), refresh: vi.fn()}));
vi.mock("@/server/actions/transaction", () => ({fetchTransactionDetailDTO:m.read, updateTransactionNote:m.note, updateTransactionPaymentMethod:vi.fn(), updateTransactionOwnerStaff:vi.fn(), voidTransaction:vi.fn(), refundTransaction:vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh:m.refresh})}));
vi.mock("@/components/admin/right-sheet", () => ({RightSheet: ({open,children}: {open:boolean;children: React.ReactNode}) => open ? React.createElement("div", {role:"dialog"}, children) : null}));
import { TransactionDrawer } from "@/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer";
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
 expect(host.textContent).toContain("載入失敗，請重新開啟");expect(host.textContent).not.toContain("載入中…");
});
