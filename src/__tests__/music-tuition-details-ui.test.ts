// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),updated:vi.fn()}));
vi.mock("@/components/customer-labels",()=>({CustomerLabels:()=>null}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mock.refresh})}));
vi.mock("@/server/actions/music-tuition",()=>({recordMusicTuitionReceipt:vi.fn()}));
vi.mock("@/lib/music-checkout-transport",()=>({musicCheckoutTransport:mock.save}));
vi.mock("@/lib/music-finance-sync",()=>({isMusicPreviewPage:()=>false}));
vi.mock("@/components/admin/modal-panel",()=>({ModalPanel:({open,children}: {open:boolean;children:never})=>open?createElement("div",{role:"dialog"},children):null}));
import {MusicTuitionDetails,type TuitionOrder} from "@/app/(dashboard)/dashboard/courses/music-tuition-details";
let host:HTMLDivElement,root:Root;
const order={id:"order",name:"吉他方案",price:1000,status:"CONFIRMED",refunds:[],tuition:{due:3200,expiry:"首次扣堂起 35 天",discountTeacherFee:false,canReceive:true,canReadBookings:true,periods:[{period:1,lessons:4,due:3200,received:1000,outstanding:2200}],receipts:[],lessons:[]}} as unknown as TuitionOrder;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function click(text:string){const b=[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());}
async function render(value=order){await act(async()=>root.render(createElement(MusicTuitionDetails,{order:value,onUpdated:mock.updated})));await click("⋯");}
it("opens top-up directly and closes an untouched form without sending a receipt",async()=>{
 await render();await click("補繳學費");expect(host.querySelector('[name="amount"]')?.getAttribute("max")).toBe("2200");
 await click("關閉");expect(host.querySelector('[role="dialog"]')).toBeNull();expect(mock.save).not.toHaveBeenCalled();
});
it("does not offer top-up without permission or on a reversed order",async()=>{
 await render({...order,tuition:{...order.tuition!,canReceive:false}});expect(document.body.textContent).not.toContain("補繳學費");
 await act(async()=>root.render(createElement(MusicTuitionDetails,{order:{...order,status:"REFUNDED"},onUpdated:mock.updated})));
 expect(document.body.textContent).not.toContain("補繳學費");
});
it("sends one receipt for repeated submits and returns to the list on success",async()=>{
 let finish!:(value:unknown)=>void;mock.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await render();await click("補繳學費");
 const method=host.querySelector<HTMLSelectElement>('[name="method"]')!;
 await act(async()=>{method.value="CARD";method.dispatchEvent(new Event("change",{bubbles:true}));});
 const form=host.querySelector("form")!;
 await act(async()=>{form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(mock.save).toHaveBeenCalledTimes(1);expect(mock.save.mock.calls[0][1]).toMatchObject({purchaseId:"order",amount:2200,expectedReceived:1000,method:"CARD"});
 await act(async()=>finish({success:true}));expect(host.querySelector('[role="dialog"]')).toBeNull();expect(mock.updated).toHaveBeenCalledTimes(1);
});
it("keeps errors and the same request key on retry",async()=>{
 mock.save.mockResolvedValue({success:false,error:"收款資料已更新"});await render();await click("補繳學費");
 const form=host.querySelector("form")!;
 for(let i=0;i<2;i++)await act(async()=>{form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(host.textContent).toContain("收款資料已更新");expect(mock.save.mock.calls[0][1].requestKey).toBe(mock.save.mock.calls[1][1].requestKey);
});
