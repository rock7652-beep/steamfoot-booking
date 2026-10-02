// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {RentalPanel,RentalHistory} from "@/app/(dashboard)/dashboard/courses/rental-panel";
const m=vi.hoisted(()=>({save:vi.fn(),get:vi.fn(),create:vi.fn(),payment:vi.fn(),search:vi.fn(),list:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-rental",()=>({saveCourseRental:m.save,getCourseRental:m.get,createRentalCustomer:m.create,saveRentalPayment:m.payment,searchRentalCustomers:m.search,cancelCourseRental:vi.fn(),listRoomRentals:m.list}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const rooms=[{id:"room",name:"A 空間",isActive:true,rentalEnabled:true,rentalHourlyRate:600}];
const permissions={customerRead:true,customerCreate:true,collect:true,correct:true,edit:true};
const record={id:"r",roomId:"room",customerId:"c",customerName:"小安",customerPhone:"0900000000",startsAt:"2026-10-02T02:00:00Z",endsAt:"2026-10-02T03:00:00Z",amount:600,note:"",revision:1,cancelledAt:null,hourlyRateSnapshot:600,payment:{id:"p",amount:600,paymentMethod:"CASH"}};
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue(record);m.search.mockResolvedValue([]);m.save.mockResolvedValue({success:false,error:"時間衝突，輸入已保留"});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(id?:string){await act(async()=>root.render(React.createElement(RentalPanel,{id,rooms,permissions,customers:[{id:"c1",name:"黃小安",phone:"0912-345-678"},{id:"c2",name:"林小美",phone:"0922222222"}],seed:{date:"2026-10-02",time:"10:00"}})));}
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

it("filters the preloaded authorized customers immediately without a search request",async()=>{
 await mount();const search=host.querySelector<HTMLInputElement>('[aria-label="搜尋租借人"]')!;
 await input(search,"黃");expect(host.textContent).toContain("黃小安");expect(host.textContent).not.toContain("林小美");
 await input(search,"345 678");expect(host.textContent).toContain("黃小安");expect(m.search).not.toHaveBeenCalled();
 await click("黃小安0912-345-678");await submit();expect(m.save.mock.calls[0][0]).toMatchObject({customerId:"c1",customerName:"黃小安"});
});

it("collects inline once and retains all inputs after failure",async()=>{
 await mount();await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 const method=host.querySelector<HTMLSelectElement>('[aria-label="租借付款方式"]')!;
 await act(async()=>{method.value="OTHER";method.dispatchEvent(new Event("change",{bubbles:true}));});
 await input(host.querySelector<HTMLInputElement>('[aria-label="租借實收金額"]')!,"550");
 await submit();expect(m.save.mock.calls[0][0]).toMatchObject({payment:{amount:550,paymentMethod:"OTHER"}});
 expect(method.value).toBe("OTHER");expect(host.querySelector<HTMLInputElement>('[aria-label="租借實收金額"]')!.value).toBe("550");
 m.save.mockResolvedValue({success:true,id:"r"});await submit();
 expect(host.textContent).toContain("已收 $600");expect(m.payment).not.toHaveBeenCalled();expect(host.querySelector("form")).toBeNull();
});

it("blocks a second submit while the first request is pending",async()=>{
 await mount();let finish!:(value:unknown)=>void;m.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(m.save).toHaveBeenCalledTimes(1);await act(async()=>finish({success:false,error:"失敗"}));
 await submit();expect(m.save).toHaveBeenCalledTimes(2);await act(async()=>finish({success:false,error:"失敗"}));
});


it("keeps rental times and payment states readable and opens the selected record in place",async()=>{
 m.list.mockResolvedValue({hasMore:false,rows:[
  {id:"r",name:"小安",startsAt:record.startsAt,endsAt:record.endsAt,cancelled:false,paid:0},
  {id:"cancelled",name:"小美",startsAt:record.startsAt,endsAt:record.endsAt,cancelled:true,paid:600},
  {id:"unpaid",name:"小林",startsAt:record.startsAt,endsAt:record.endsAt,cancelled:false,paid:null},
 ]});
 await act(async()=>root.render(React.createElement(RentalHistory,{roomId:"room",rooms,permissions})));
 const table=host.querySelector('table[aria-label="租借紀錄"]')!;
 expect(Array.from(table.querySelectorAll("th")).map(th=>th.textContent)).toEqual(["日期","時段","顧客","收款"]);
 const rows=table.querySelectorAll("tbody tr");
 expect(rows[0].textContent).toContain("10:00–11:00");expect(rows[0].textContent).toContain("已收 $0");
 expect(rows[1].textContent).toContain("已取消已收 $600");expect(rows[2].textContent).toContain("未收");
 await click("小安");expect(m.get).toHaveBeenCalledWith("r");expect(host.querySelector('a[href="tel:0900000000"]')).toBeTruthy();
 expect(host.textContent).toContain("已收 $600");await click("← 租借紀錄");expect(host.querySelector('table[aria-label="租借紀錄"]')).toBeTruthy();
});
