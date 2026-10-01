// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {RentalPanel} from "@/app/(dashboard)/dashboard/courses/rental-panel";
const m=vi.hoisted(()=>({save:vi.fn(),get:vi.fn(),create:vi.fn(),payment:vi.fn(),search:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-rental",()=>({saveCourseRental:m.save,getCourseRental:m.get,createRentalCustomer:m.create,saveRentalPayment:m.payment,searchRentalCustomers:m.search,cancelCourseRental:vi.fn(),listRoomRentals:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const rooms=[{id:"room",name:"A 空間",isActive:true,rentalEnabled:true,rentalHourlyRate:600}];
const permissions={customerRead:true,customerCreate:true,collect:true,correct:true,edit:true};
const record={id:"r",roomId:"room",customerId:"c",customerName:"小安",customerPhone:"0900000000",startsAt:"2026-10-02T02:00:00Z",endsAt:"2026-10-02T03:00:00Z",amount:600,note:"",revision:1,cancelledAt:null,hourlyRateSnapshot:600,payment:{id:"p",amount:600,paymentMethod:"CASH"}};
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue(record);m.search.mockResolvedValue([]);m.save.mockResolvedValue({success:false,error:"時間衝突，輸入已保留"});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(id?:string){await act(async()=>root.render(React.createElement(RentalPanel,{id,rooms,permissions,seed:{date:"2026-10-02",time:"10:00"}})));}
async function click(text:string){await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent===text)!.click());}
async function input(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("adds a customer inside the rental form and preserves the time and quote after a failed save",async()=>{
 await mount();await input(host.querySelector<HTMLInputElement>('input[name="date"]')!,"2026-10-03");await click("＋新顧客");
 await input(host.querySelector<HTMLInputElement>('input[name="newName"]')!,"新學員");await input(host.querySelector<HTMLInputElement>('input[name="newPhone"]')!,"0911111111");
 m.create.mockResolvedValue({success:true,customer:{id:"new",name:"新學員",phone:"0911111111",existing:false}});await click("建立並帶入");await submit();
 expect(m.save.mock.calls[0][0]).toMatchObject({customerId:"new",date:"2026-10-03",time:"10:00",amount:600});expect(host.textContent).toContain("輸入已保留");expect(host.querySelector<HTMLInputElement>('input[name="date"]')!.value).toBe("2026-10-03");
 expect(host.textContent).not.toContain("點名");expect(host.textContent).not.toContain("扣堂");
});
it("places the correction pencil beside the paid amount and keeps the same panel",async()=>{
 await mount("r");expect(host.textContent).toContain("已收 $600");const pencil=host.querySelector<HTMLButtonElement>('[aria-label="更正租借收款"]')!;expect(pencil).toBeTruthy();await act(async()=>pencil.click());
 expect(host.querySelectorAll("form")).toHaveLength(1);expect(host.textContent).toContain("其他收入");await input(host.querySelector<HTMLInputElement>('input[name="paymentAmount"]')!,"550");await input(host.querySelector<HTMLInputElement>('input[name="reason"]')!,"誤植");
 m.payment.mockResolvedValue({success:false,error:"原收款已變更"});await submit();expect(m.payment.mock.calls[0][0]).toMatchObject({rentalId:"r",originalId:"p",amount:550,reason:"誤植"});expect(host.querySelector<HTMLInputElement>('input[name="paymentAmount"]')!.value).toBe("550");
});
it("quotes a thirty-minute rental at half the hourly rate",async()=>{
 await mount();const length=Array.from(host.querySelectorAll("label")).find(l=>l.textContent?.startsWith("時長"))!.querySelector("input")!;await input(length,"30");await submit();expect(m.save.mock.calls[0][0]).toMatchObject({durationMinutes:30,amount:300});
});
