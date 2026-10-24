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
 await render();await click("補登收款");expect(host.querySelector('[name="amount"]')?.getAttribute("max")).toBe("2200");
 await click("關閉");expect(host.querySelector('[role="dialog"]')).toBeNull();expect(mock.save).not.toHaveBeenCalled();
});
it("does not offer top-up without permission or on a reversed order",async()=>{
 await render({...order,tuition:{...order.tuition!,canReceive:false}});expect(document.body.textContent).not.toContain("補登收款");
 await act(async()=>root.render(createElement(MusicTuitionDetails,{order:{...order,status:"REFUNDED"},onUpdated:mock.updated})));
 expect(document.body.textContent).not.toContain("補登收款");
});
it("sends one receipt for repeated submits and returns to the list on success",async()=>{
 let finish!:(value:unknown)=>void;mock.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await render();await click("補登收款");
 const method=host.querySelector<HTMLSelectElement>('[name="method"]')!;
 await act(async()=>{method.value="CARD";method.dispatchEvent(new Event("change",{bubbles:true}));});
 const form=host.querySelector("form")!;
 await act(async()=>{form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(mock.save).toHaveBeenCalledTimes(1);expect(mock.save.mock.calls[0][1]).toMatchObject({purchaseId:"order",amount:2200,expectedReceived:1000,method:"CARD"});
 await act(async()=>finish({success:true}));expect(host.querySelector('[role="dialog"]')).toBeNull();expect(mock.updated).toHaveBeenCalledTimes(1);
});
it("keeps errors and the same request key on retry",async()=>{
 mock.save.mockResolvedValue({success:false,error:"收款資料已更新"});await render();await click("補登收款");
 const form=host.querySelector("form")!;
 for(let i=0;i<2;i++)await act(async()=>{form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(host.textContent).toContain("收款資料已更新");expect(mock.save.mock.calls[0][1].requestKey).toBe(mock.save.mock.calls[1][1].requestKey);
});

it("closes a changed receipt draft silently without recording money",async()=>{
 await render();await click("補登收款");
 const method=host.querySelector<HTMLSelectElement>('[name="method"]')!;
 await act(async()=>{method.value="OTHER";method.dispatchEvent(new Event("change",{bubbles:true}));});
 await click("關閉");expect(host.querySelector('[role="dialog"]')).toBeNull();expect(mock.save).not.toHaveBeenCalled();
});

it("separates one period from the purchase total without changing receipt limits or payload",async()=>{
 const value={...order,tuition:{...order.tuition!,due:6400,periods:[{period:1,lessons:4,due:3200,received:1000,outstanding:2200},{period:2,lessons:4,due:3200,received:0,outstanding:3200}]}};
 await act(async()=>root.render(createElement(MusicTuitionDetails,{order:value,onUpdated:mock.updated,receiptPeriod:1,closeLabel:"返回課程與學費"})));
 await click("補登收款");
 const summary=host.querySelector('[aria-label="本期收款摘要"]')!;
 const primary=summary.querySelector('dl')!;
 expect(primary.textContent).toContain("本期應收NT$ 3,200");
 expect(primary.textContent).toContain("本期已收NT$ 1,000");
 expect(primary.textContent).toContain("本期未收NT$ 2,200");
 expect(primary.textContent).not.toContain("6,400");
 expect(summary.querySelector('p')?.textContent).toBe("整筆購課：應收 NT$ 6,400 · 已收 NT$ 1,000 · 未收 NT$ 5,400");
 expect(host.querySelector('[name="amount"]')?.getAttribute('max')).toBe("2200");
 await click("返回課程與學費");expect(mock.save).not.toHaveBeenCalled();
 await click("補登收款");mock.save.mockResolvedValue({success:true});
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(mock.save.mock.calls[0][1]).toMatchObject({purchaseId:"order",amount:2200,expectedReceived:1000});
});

it("labels a renewal receipt with the cumulative period while preserving its purchase-local balance",async()=>{
 await act(async()=>root.render(createElement(MusicTuitionDetails,{order,onUpdated:mock.updated,receiptPeriod:1,displayPeriod:3})));
 await click("補登收款");expect(host.querySelector("h3")?.textContent).toContain("補登第 3 期收款");
 expect(host.querySelector('[name="amount"]')?.getAttribute("max")).toBe("2200");
 mock.save.mockResolvedValue({success:true});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(mock.save.mock.calls[0][1]).toMatchObject({purchaseId:"order",amount:2200,expectedReceived:1000});
});
