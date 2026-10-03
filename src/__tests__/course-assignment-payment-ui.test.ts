// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {CourseAssignmentPayment} from "@/components/admin/course-assignment-payment";
const cashStatus=vi.hoisted(()=>vi.fn());
vi.mock("@/server/actions/course-checkout-status",()=>({getCourseCheckoutCashStatus:cashStatus}));
let host:HTMLDivElement,root:Root;
const summary=vi.fn();
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(extra={}){await act(async()=>root.render(createElement(CourseAssignmentPayment,{price:1000,canDiscount:true,onSummary:summary,...extra})));}
async function change(selector:string,value:string){const el=host.querySelector(selector) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));});}
it("starts without a discount input or assumed cash payment",async()=>{await render();expect(host.querySelector('input[type="number"]')).toBeNull();expect((host.querySelector('[name="paymentMethod"]') as HTMLSelectElement).value).toBe("");expect(summary).toHaveBeenLastCalledWith({paid:1000,valid:false});});
it("nine-tenths price sends a ten percent deduction, not ninety",async()=>{await render();await change("select","RATE");expect((host.querySelector('[name="discountValue"]') as HTMLInputElement).value).toBe("10");expect(summary).toHaveBeenLastCalledWith({paid:900,valid:false});await change('[name="paymentMethod"]',"CARD");expect(summary).toHaveBeenLastCalledWith({paid:900,valid:true});});
it("only asks for transfer digits for transfer, preserving leading zeros",async()=>{await render();await change('[name="paymentMethod"]',"BANK_TRANSFER");expect(summary).toHaveBeenLastCalledWith({paid:1000,valid:false});await change('[name="transferLastFour"]',"0123");expect(summary).toHaveBeenLastCalledWith({paid:1000,valid:true});await change('[name="paymentMethod"]',"CARD");expect(host.querySelector('[name="transferLastFour"]')).toBeNull();});
it("full discount has no payment fields and cannot bypass the cost floor",async()=>{await render();await change("select","AMOUNT");await change('input[type="number"]',"1000");expect(summary).toHaveBeenLastCalledWith({paid:0,valid:true});expect(host.querySelector('select[name="paymentMethod"]')).toBeNull();await render({storeCost:100});expect(summary).toHaveBeenLastCalledWith({paid:0,valid:false});});
it("does not render internal allocation without permission",async()=>{await render();expect(host.textContent).not.toContain("開發人所得");await render({showAllocation:true});expect(host.textContent).toContain("開發人所得");});
it("discount-less accounts submit zero deduction",async()=>{await render({canDiscount:false});expect(host.querySelectorAll("select")).toHaveLength(1);expect((host.querySelector('[name="discountValue"]') as HTMLInputElement).value).toBe("0");});

it("blocks cash until open, preserves discount and refreshes on return",async()=>{
 cashStatus.mockResolvedValue({success:true,status:null});
 await render();await change("select","RATE");await change('[name="paymentMethod"]',"CASH");
 expect(summary).toHaveBeenLastCalledWith({paid:900,valid:false});
 expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/dashboard/cash-drawer");
 cashStatus.mockResolvedValue({success:true,status:"OPEN"});
 await act(async()=>{window.dispatchEvent(new Event("focus"));});
 expect(summary).toHaveBeenLastCalledWith({paid:900,valid:true});
 expect((host.querySelector('[name="discountValue"]') as HTMLInputElement).value).toBe("10");
});
it("failed cash check can be retried and does not block card payments",async()=>{
 cashStatus.mockRejectedValue(new Error("offline"));await render();await change('[name="paymentMethod"]',"CASH");
 expect(host.textContent).toContain("無法確認現金抽屜");expect(summary).toHaveBeenLastCalledWith({paid:1000,valid:false});
 await change('[name="paymentMethod"]',"CARD");expect(summary).toHaveBeenLastCalledWith({paid:1000,valid:true});
});
