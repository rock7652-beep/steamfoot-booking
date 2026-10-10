// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const cancel=vi.hoisted(()=>vi.fn(async()=>({success:true})));
vi.mock("@/server/actions/spa-customer-booking",()=>({cancelSpaCustomerBooking:cancel,createSpaCustomerBooking:vi.fn(),fetchSpaCustomerAvailability:vi.fn()}));
import {SpaCustomerBookingForm} from "@/app/(customer)/book/new/spa-customer-booking-form";
it("keeps confirmed bookings cancellable when the customer booking window has not opened",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(createElement(SpaCustomerBookingForm,{treatments:[{id:"t",name:"按摩",variantLabel:null,price:100,serviceMinutes:60}],bookingClosedMessage:"本店預約尚未開放",today:"2026-10-10",latestDate:"2026-10-17",quickDates:[],initialBookings:[{id:"b",date:"2026-10-11",startTime:"10:00",endTime:"11:00",serviceName:"既有預約",staffName:"小美",locationName:"房間",status:"CONFIRMED"}]})));
 expect(host.textContent).toContain("本店預約尚未開放");expect(host.textContent).toContain("既有預約");expect(host.querySelector("fieldset")?.disabled).toBe(true);
 const find=(label:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()===label)!;
 expect(find("取消這筆預約").closest("fieldset")).toBeNull();await act(async()=>find("取消這筆預約").click());await act(async()=>find("確認取消").click());expect(cancel).toHaveBeenCalledWith({bookingId:"b"});expect(host.textContent).toContain("已取消");
 }finally{await act(async()=>root.unmount());host.remove();}
});
