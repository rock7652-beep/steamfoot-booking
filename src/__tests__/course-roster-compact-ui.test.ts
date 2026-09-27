// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),batch:vi.fn(),status:vi.fn(),create:vi.fn(),save:vi.fn(),collectModal:vi.fn(()=>null),correctModal:vi.fn(()=>null)}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course-members",()=>({loadCourseSessionDetail:m.load,updateCourseRosterBatch:m.batch,createCourseBooking:m.create,saveCourseCustomer:m.save,updateCourseBookingStatus:m.status,cancelCourseSession:vi.fn()}));
vi.mock("@/server/actions/course-trial",()=>({createCourseTrial:vi.fn(),collectCourseTrial:vi.fn(),voidCourseTrialPayment:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal",()=>({CollectTrialModal:m.collectModal}));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal",()=>({CorrectTrialCollectionModal:m.correctModal}));
import {CourseRoster} from "@/app/(dashboard)/dashboard/courses/roster";
it("shows all twenty compact rows and selects them for one batch without cancelled bookings",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=Array.from({length:21},(_,i)=>({id:`b${i}`,customerName:`學員${i}`,customerId:`c${i}`,customerPhone:`09000000${String(i).padStart(2,"0")}`,sharedCard:i===0,bookingSource:i===0?"黃教練代約":"本人預約",status:i===20?"CANCELLED":"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"十堂",available:10,expiresAt:"2099-01-01T00:00:00Z",serviceNote:"內部備註",notes:"本次備註",pointCost:1}));
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-01T00:00:00Z",pointCost:1},roster,cards:[],trial:null}});m.batch.mockResolvedValue({success:true});m.status.mockResolvedValue({success:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:false,canEdit:true})));
  expect(host.querySelectorAll('input[aria-label^="選取 "]')).toHaveLength(20);
  expect(host.querySelectorAll('a[href^="tel:"]')).toHaveLength(20);
  expect(host.textContent).toContain("共卡");
  expect(host.textContent).toContain("黃教練代約");
  expect(host.textContent).toContain("本人預約");
  expect(host.querySelector('[aria-label="上課統計"]')?.textContent).toContain("已預約 20/20");
  expect(host.textContent).toContain("每 60 秒自動更新");
  expect(host.querySelector('input[placeholder="搜尋姓名或手機"]')).toBeTruthy();
  expect([...host.querySelectorAll("button")].filter(b=>b.textContent==="出席")).toHaveLength(20);
  expect([...host.querySelectorAll("button")].filter(b=>b.textContent==="未到")).toHaveLength(20);
  expect([...host.querySelectorAll("button")].filter(b=>b.textContent==="取消")).toHaveLength(20);
  expect(host.querySelectorAll("details[open]")).toHaveLength(0);
  const noShow=[...host.querySelectorAll("button")].find(b=>b.textContent==="未到");expect(noShow).toBeTruthy();
  await act(async()=>noShow!.click());
  expect(host.textContent).toContain("未到扣堂＋發補課券");
  const grant=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("未到扣堂＋發補課券"));expect(grant).toBeTruthy();
  await act(async()=>grant!.click());
  expect(m.status).toHaveBeenCalledWith({bookingId:"b0",status:"NO_SHOW",noShowChoice:"DEDUCTED_WITH_MAKEUP"});
  await act(async()=>(host.querySelector('input[aria-label="全選全班學員"]') as HTMLInputElement).click());
  const apply=[...host.querySelectorAll("button")].find(b=>b.textContent==="套用 20 人");expect(apply).toBeTruthy();
  await act(async()=>apply!.click());
  expect(m.batch).toHaveBeenCalledWith({sessionId:"session",target:"CHECKED_IN",bookings:roster.slice(0,20).map(b=>({id:b.id,status:b.status}))});
 }finally{await act(async()=>root.unmount());host.remove();}
});


it("finds a learner by partial phone and submits the selected earliest-expiry plan",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const onMemberBookingReadyChange=vi.fn();
 m.create.mockResolvedValue({success:true});
 const cards=[{
  id:"card-fast",name:"快到期方案",unit:"SESSION",available:3,remaining:3,expired:false,closed:false,
  expiresAt:"2026-10-01T00:00:00Z",members:[{id:"customer-1",name:"陳小美",phone:"0912345678"}],entries:[],
 },{
  id:"card-later",name:"較晚到期方案",unit:"SESSION",available:5,remaining:5,expired:false,closed:false,
  expiresAt:"2026-12-01T00:00:00Z",members:[{id:"customer-1",name:"陳小美",phone:"0912345678"}],entries:[],
 }];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-21T10:00:00Z",pointCost:1},roster:[],cards,trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:true,canEdit:true,view:"member-booking",onMemberBookingReadyChange})));
  expect(onMemberBookingReadyChange).toHaveBeenLastCalledWith(false);
  const search=host.querySelector('input[placeholder="輸入部分姓名或手機末幾碼"]') as HTMLInputElement;
  expect(search).toBeTruthy();
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
   setter.call(search,"5678");
   search.dispatchEvent(new Event("input",{bubbles:true}));
  });
  const learner=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("陳小美"));
  expect(learner?.textContent).toContain("0912345678");
  await act(async()=>learner!.click());
  expect((host.querySelector('select') as HTMLSelectElement).value).toBe("card-fast");
  expect(onMemberBookingReadyChange).toHaveBeenLastCalledWith(true);
  const form=host.querySelector("#course-member-booking-form") as HTMLFormElement;
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({sessionId:"session",customerId:"customer-1",cardId:"card-fast"}));
 }finally{await act(async()=>root.unmount());host.remove();}
});

it("keeps member booking unavailable when the learner has no eligible plan",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const onMemberBookingReadyChange=vi.fn();
 const cards=[{
  id:"expired-card",name:"已到期方案",unit:"SESSION",available:3,remaining:3,expired:true,closed:false,
  expiresAt:"2026-09-01T00:00:00Z",members:[{id:"customer-2",name:"林小華",phone:"0987654321"}],entries:[],
 }];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-21T10:00:00Z",pointCost:1},roster:[],cards,trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:true,canEdit:true,view:"member-booking",onMemberBookingReadyChange})));
  const search=host.querySelector('input[placeholder="輸入部分姓名或手機末幾碼"]') as HTMLInputElement;
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
   setter.call(search,"小華");
   search.dispatchEvent(new Event("input",{bubbles:true}));
  });
  const learner=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("林小華"));
  await act(async()=>learner!.click());
  expect(host.textContent).toContain("沒有可用方案，請先指派方案。");
  expect(onMemberBookingReadyChange).toHaveBeenLastCalledWith(false);
  expect(host.textContent).not.toContain("改用體驗預約");
 }finally{await act(async()=>root.unmount());host.remove();}
});

it("offers an in-flow new customer path from member booking",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const onCreateCustomer=vi.fn();
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-21T10:00:00Z",pointCost:1},roster:[],cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:true,canEdit:true,view:"member-booking",onCreateCustomer})));
  const create=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("直接建立新顧客"));
  expect(create).toBeTruthy();
  await act(async()=>create!.click());
  expect(onCreateCustomer).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it.each([
 {paid:false,canCollect:true,allow:true,action:"收款"},
 {paid:true,canCollect:true,allow:true,action:"更正收款"},
 {paid:false,canCollect:false,allow:true,action:null},
 {paid:false,canCollect:true,allow:false,action:null},
])("keeps trial collection next to the amount and respects permissions: %j",async({paid,canCollect,allow,action})=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 m.collectModal.mockClear();m.correctModal.mockClear();
 const payment={id:"receipt",status:"SUCCESS",amount:300,paymentMethod:"CASH",createdAt:"2026-09-01T00:00:00Z"};
 const booking={id:"trial-booking",customerId:"customer",customerName:"體驗學員",customerPhone:"0900000000",status:"RESERVED",bookingKind:"TRIAL",trialPrice:300,trialPayments:paid?[payment]:[],checkedInAt:null,serviceNote:"",notes:"",pointCost:1};
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-01T00:00:00Z",pointCost:1},roster:[booking],cards:[],trial:{canCollect,canCorrect:true,customers:[],settings:{trialAllowPriceEdit:true,trialDefaultPrice:300,trialMinPrice:0,trialMaxPrice:1000}}}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:false,canEdit:true,allowTrialActions:allow})));
  const row=host.querySelector("li")!;
  const buttons=[...row.querySelectorAll("button")];
  const collect=buttons.find(b=>b.textContent?.trim()==="收款");
  const correct=buttons.find(b=>b.textContent?.trim()==="更正收款");
  expect(row.textContent).toContain(paid?"✓ 已收 NT$ 300":"未收款");
  if(action==="收款"){
   expect(collect).toBeTruthy();expect(correct).toBeUndefined();
   expect(collect!.parentElement!.textContent).toContain("NT$ 300");
   await act(async()=>collect!.click());
   expect(m.collectModal).toHaveBeenCalledWith(expect.objectContaining({bookingId:"trial-booking",expectedAmount:300}),undefined);
   expect(m.correctModal).not.toHaveBeenCalled();
  }else if(action==="更正收款"){
   expect(collect).toBeUndefined();expect(correct).toBeTruthy();
   await act(async()=>correct!.click());
   expect(m.correctModal).toHaveBeenCalledWith(expect.objectContaining({bookingId:"trial-booking",originalTransactionId:"receipt",originalAmount:300}),undefined);
   expect(m.collectModal).not.toHaveBeenCalled();
  }else{expect(collect).toBeUndefined();expect(correct).toBeUndefined();}
 }finally{await act(async()=>root.unmount());host.remove();}
});
