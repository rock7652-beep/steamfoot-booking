// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),quick:vi.fn(),batch:vi.fn(),status:vi.fn(),create:vi.fn(),save:vi.fn(),collectModal:vi.fn(()=>null),correctModal:vi.fn(()=>null)}));

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course",()=>({scheduleTeacherMakeup:vi.fn()}));
vi.mock("@/server/actions/course-checkout-status",()=>({getCourseCheckoutCashStatus:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({loadCourseSessionDetail:m.load,loadCourseRosterQuick:m.quick,updateCourseRosterBatch:m.batch,createCourseBooking:m.create,saveCourseCustomer:m.save,updateCourseBookingStatus:m.status,cancelCourseSession:vi.fn()}));
vi.mock("@/server/actions/course-trial",()=>({createCourseTrial:vi.fn(),collectCourseTrial:vi.fn(),voidCourseTrialPayment:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal",()=>({CollectTrialModal:m.collectModal}));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal",()=>({CorrectTrialCollectionModal:m.correctModal}));
import {CourseRoster} from "@/app/(dashboard)/dashboard/courses/roster";
it("shows each group learner's own term, dates and distinct leave/no-show counts", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const date=(day:number)=>`2026-09-${String(day).padStart(2,"0")}T10:00:00.000Z`;
 const base={customerPhone:"",sharedCard:false,bookingSource:"店長建立",status:"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"團班",termLeaveCount:0,termNoShowCount:0,termPrivateLeaves:[],absenceCount:0,absenceHistory:[],available:3,unit:"SESSION",notes:"",pointCost:1,nextPaidLessons:null};
 const roster=[
  {id:"a",customerId:"a",customerName:"甲",...base,termIndex:5,termCount:8,termLessons:[1,8,15,22,29].map(day=>({date:date(day),status:day===29?"待上課":"已出席"}))},
  {id:"b",customerId:"b",customerName:"乙",...base,termIndex:3,termCount:6,termLessons:[15,22,29].map(day=>({date:date(day),status:"待上課"}))},
  {id:"c",customerId:"c",customerName:"丙",...base,termIndex:4,termCount:7,termLeaveCount:1,termNoShowCount:1,termLessons:[8,15,22,29].map((day,index)=>({date:date(day),status:["已出席","請假","曠課","待上課"][index]}))},
 ];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:date(29),pointCost:1,teacherAttendance:"SCHEDULED",teacherNote:""},roster,cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"group-term",capacity:15,canCreate:false,canEdit:true,musicLayout:true,classType:"GROUP",teacherName:"老師"})));
  const rows=()=>[...host.querySelectorAll("section[aria-label='學員'] li")];
  expect(rows().map(row=>row.textContent?.match(/本期第 \d+\/\d+ 堂/)?.[0])).toEqual(["本期第 5/8 堂","本期第 3/6 堂","本期第 4/7 堂"]);
  expect(rows()[2].textContent).toContain("此方案請假 1・曠課 1");
  await act(async()=>[...rows()[2].querySelectorAll("button")].find(button=>button.textContent?.includes("查看日期"))!.click());
  expect(rows()[2].textContent).toContain("2026-09-15 請假");
  expect(rows()[2].textContent).toContain("2026-09-22 曠課");
  await act(async()=>[...rows()[1].querySelectorAll("button")].find(button=>button.textContent?.includes("查看日期"))!.click());
  expect(rows()[1].querySelector("[id^='lesson-history-']")).toBeTruthy();
  expect(rows()[2].querySelector("[id^='lesson-history-']")).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it("shows private makeup and renewal without combining leave with paid lessons",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=[{id:"private",customerId:"student",customerName:"學員",customerPhone:"",sharedCard:false,bookingSource:"店長建立",status:"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"四堂一期",termIndex:4,termCount:4,termLeaveCount:1,termNoShowCount:0,termLessons:["01","15","22","29"].map(day=>({date:`2026-09-${day}T10:00:00.000Z`,status:"已出席"})),termPrivateLeaves:["2026-09-08T10:00:00.000Z"],nextPaidLessons:8,termPayment:{date:"2026-09-01T10:00:00.000Z",amount:3200,method:"CASH"},nextTerm:{payment:{date:"2026-09-29T10:00:00.000Z",amount:6400,method:"BANK_TRANSFER"},lessons:[{date:"2026-10-06T10:00:00.000Z",status:"待上課"}]},absenceCount:1,absenceHistory:[],available:0,unit:"SESSION",notes:"",pointCost:1}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-29T10:00:00.000Z",pointCost:1,teacherAttendance:"SCHEDULED",teacherNote:""},roster,cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"private-term",capacity:1,canCreate:false,canEdit:true,musicLayout:true,classType:"PRIVATE",teacherName:"老師"})));
  expect(host.textContent).toContain("本期第 4/4 堂");
  expect(host.textContent).toContain("下期已繳 8 堂");
  await act(async()=>[...host.querySelectorAll("summary")].find(summary=>summary.textContent?.includes("查看本期上課日期"))!.click());
  expect(host.textContent).toContain("2026-09-08 請假・不扣堂");
  expect(host.textContent).toContain("4. 2026-09-29");
  expect(host.textContent).toContain("本期付款：2026-09-01 · NT$ 3,200 · 現金");
  expect(host.textContent).toContain("下期已繳 8 堂 · 2026-09-29 · NT$ 6,400 · 轉帳");
  expect(host.textContent).toContain("1. 2026-10-06 待上課");
 }finally{await act(async()=>root.unmount());host.remove();}
});
it("signs in music learners as attended in one batch and gives no makeup coupon for absence",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=[{id:"music-booking",customerName:"小安",customerId:"customer",customerPhone:"0900000000",sharedCard:false,bookingSource:"店長建立",status:"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"四堂一期",termCount:4,termLessons:[],termPrivateLeaves:[],absenceCount:0,absenceHistory:[],available:4,unit:"SESSION",notes:"",pointCost:1}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-27T05:00:00Z",pointCost:1,teacherAttendance:"SCHEDULED",teacherNote:""},roster,cards:[],trial:null}});
 m.quick.mockResolvedValue({success:true,data:{roster,teacherNote:"",teacherAttendance:"SCHEDULED",teacherAttendanceReason:""}});
 m.batch.mockResolvedValue({success:true});m.status.mockResolvedValue({success:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"music",capacity:1,canCreate:false,canEdit:true,musicLayout:true,teacherName:"老師"})));
  expect([...host.querySelectorAll<HTMLOptionElement>('select[aria-label="批次點名狀態"] option')].map(option=>option.value)).toEqual(["ATTENDED","RESERVED","NO_SHOW"]);
  await act(async()=>host.querySelector('input[aria-label="全選符合此操作的學員"]')!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="套用 1 人")!.click());
  expect(m.batch).toHaveBeenLastCalledWith({sessionId:"music",target:"ATTENDED",bookings:[{id:"music-booking",status:"RESERVED"}]});
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="曠課扣堂")!.click());
  expect(m.status).toHaveBeenLastCalledWith({bookingId:"music-booking",status:"NO_SHOW",noShowChoice:"DEDUCTED"});
  expect(host.textContent).not.toContain("發補課券");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="備註")!.click());
  const save=[...host.querySelectorAll('button[type="submit"]')].find(button=>button.textContent==="儲存")!;
  expect(save.className).toContain("bg-primary-700");expect(save.className).not.toContain("bg-white");
 }finally{await act(async()=>root.unmount());host.remove();}
});

it("keeps other music learners interactive while one restoration is saving", async () => {
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const rows=["b1","b2"].map((id,index)=>({
  id,customerName:`學員${index+1}`,customerId:`c${index+1}`,customerPhone:"0912345678",
  sharedCard:false,bookingSource:"店長建立",status:"ATTENDED",bookingKind:"CARD",
  checkedInAt:"2026-09-28T10:00:00Z",trialPayments:[],planName:"團班八堂",
  termCount:8,termIndex:1,termLeaveCount:0,termNoShowCount:0,
  termLessons:[],termPrivateLeaves:[],absenceCount:0,absenceHistory:[],
  available:7,unit:"SESSION",notes:"",pointCost:1,
 }));
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-28T10:00:00Z",pointCost:1,teacherAttendance:"SCHEDULED",teacherNote:""},roster:rows,cards:[],trial:null}});
 m.quick.mockResolvedValue({success:true,data:{roster:rows,teacherNote:"",teacherAttendance:"SCHEDULED",teacherAttendanceReason:""}});
 let finishFirst!: (value:{success:true})=>void;
 let finishSecond!: (value:{success:true})=>void;
 const first=new Promise<{success:true}>(resolve=>{finishFirst=resolve;});
 const second=new Promise<{success:true}>(resolve=>{finishSecond=resolve;});
 m.batch.mockReset().mockReturnValueOnce(first).mockReturnValueOnce(second);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"group",capacity:15,canCreate:false,canEdit:true,musicLayout:true,classType:"GROUP",teacherName:"老師"})));
  const items=()=>[...host.querySelectorAll("section[aria-label='學員'] li")];
  act(()=>{[...items()[0].querySelectorAll("button")].find(button=>button.textContent==="恢復待點名")!.click();});
  expect(items()[0].textContent).toContain("儲存中");
  const secondButton=[...items()[1].querySelectorAll("button")].find(button=>button.textContent==="恢復待點名")!;
  expect(secondButton.disabled).toBe(false);
  act(()=>secondButton.click());
  expect(m.batch).toHaveBeenCalledTimes(2);
  await act(async()=>{finishFirst({success:true});finishSecond({success:true});await Promise.all([first,second]);});
 } finally {await act(async()=>root.unmount());host.remove();}
});

it("shows all twenty compact rows and selects them for one batch without cancelled bookings",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=Array.from({length:21},(_,i)=>({id:`b${i}`,customerName:`學員${i}`,customerId:`c${i}`,customerPhone:`09000000${String(i).padStart(2,"0")}`,sharedCard:i===0,bookingSource:i===0?"黃教練代約":"本人預約",status:i===20?"CANCELLED":"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"十堂",available:10,expiresAt:"2099-01-01T00:00:00Z",serviceNote:"內部備註",notes:"本次備註",pointCost:1}));
 m.quick.mockResolvedValue({success:true,data:{roster,teacherNote:"",teacherAttendance:"SCHEDULED",teacherAttendanceReason:""}});
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

it("preselects pending makeup on the original card and allows removing the link",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const card={id:"original",name:"原四堂",unit:"SESSION",available:1,expiresAt:"2099-01-01T00:00:00.000Z",expired:false,closed:false,members:[{id:"learner",name:"補課學員",phone:"0900"}]};
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2090-01-02T10:00:00.000Z",pointCost:1},roster:[],cards:[card,{...card,id:"renewal",name:"下期八堂",available:8,expiresAt:"2098-01-01T00:00:00.000Z"}],trial:null,pendingMakeups:[{id:"leave",customerId:"learner",cardId:"original",date:"2090-01-01T10:00:00.000Z"}]}});
 m.create.mockResolvedValue({success:false,error:"test stopped before write"});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(createElement(CourseRoster,{sessionId:"new",capacity:1,canCreate:true,canEdit:true,musicLayout:true,classType:"PRIVATE",view:"member-booking"})));
 const search=host.querySelector("#course-member-search") as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"補課");search.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("補課學員"))!.click());
 const select=host.querySelector('select[aria-label="補課紀錄"]') as HTMLSelectElement;
 expect(select.value).toBe("leave");expect(host.textContent).toContain("待補課 1 堂");
 expect([...host.querySelectorAll("select")][1].value).toBe("original");
 const submit=()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
 await act(async()=>{submit();});expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({cardId:"original",makeupForBookingId:"leave"}));
 await act(async()=>{select.value="";select.dispatchEvent(new Event("change",{bubbles:true}));});
 await act(async()=>{submit();});expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({makeupForBookingId:null}));
 }finally{await act(async()=>root.unmount());host.remove();}
});
