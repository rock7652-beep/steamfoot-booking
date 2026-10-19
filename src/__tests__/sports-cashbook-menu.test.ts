// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/cashbook",()=>({createCashbookEntry:m.create,updateCashbookEntry:m.update}));
vi.mock("@/app/(dashboard)/dashboard/cashbook/cashbook-form-fields",()=>({CashbookFormFields:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields",()=>({CashbookEntryFields:()=>null}));
vi.mock("@/components/operation-audit-access",()=>({useOperationAuditAccess:()=>true,useHqOperationAuditAccess:()=>false}));
vi.mock("@/server/actions/operation-audit",()=>({loadOperationHistory:async()=>({success:true,data:[]})}));
vi.mock("@/components/audit-changes",()=>({AuditChanges:()=>null}));
import {OperationHistoryButton} from "@/components/operation-history-button";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {CashbookEditor} from "@/app/(dashboard)/dashboard/cashbook/cashbook-editor";
it("editing remains visible after the menu closes, and opening/closing never writes a transaction",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 // eslint-disable-next-line react/no-children-prop -- React createElement requires the component’s required children in its props type.
 await act(async()=>root.render(createElement(ExclusiveMenu,{label:"記帳操作",triggerText:"⋯",children:createElement(CashbookEditor,{storeId:"sports-live-flow-store",inMenu:true,instantSearch:false,today:"2026-10-18",closedDates:[],staffOptions:[],canAssignStaff:false,entry:{id:"e",entryDate:"2026-10-18",type:"INCOME",category:"其他",amount:"200",paymentMethod:"OTHER",note:"",staffId:null,customer:null}})})));
 await act(async()=>(host.querySelector('button') as HTMLButtonElement).click());
 await act(async()=>[...document.body.querySelectorAll('button')].find(b=>b.textContent==="編輯")!.click());
 const dialog=document.querySelector('[role="dialog"]')!;expect(dialog).toBeTruthy();expect(dialog.closest('[hidden]')).toBeNull();expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe("false");
 await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent?.trim()==="關閉")!.click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 await act(async()=>root.unmount());host.remove();
});

it("audit history also survives closing the native menu without changing read permissions",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 // eslint-disable-next-line react/no-children-prop -- React createElement requires the component’s required children in its props type.
 await act(async()=>root.render(createElement(ExclusiveMenu,{label:"記帳操作",triggerText:"⋯",children:createElement(OperationHistoryButton,{targetType:"CashbookEntry",targetId:"e",portal:true})})));
 await act(async()=>(host.querySelector('button') as HTMLButtonElement).click());await act(async()=>[...document.body.querySelectorAll('button')].find(b=>b.textContent==="查看紀錄")!.click());
 const dialog=document.querySelector('[role="dialog"]')!;expect(dialog).toBeTruthy();expect(dialog.closest('[hidden]')).toBeNull();expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe("false");
 await act(async()=>(dialog.querySelector('button[aria-label="關閉操作紀錄"]') as HTMLButtonElement).click());expect(document.querySelector('[role="dialog"]')).toBeNull();await act(async()=>root.unmount());host.remove();
});
