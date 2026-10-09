// @vitest-environment jsdom
vi.mock("@/server/actions/course-companions",()=>({addCourseCompanion:vi.fn(),loadCourseCompanionUsage:vi.fn(),saveCourseCompanionUsage:vi.fn()}));
vi.mock("@/server/actions/course-roster-enrollment",()=>({previewCourseEnrollment:vi.fn().mockResolvedValue({success:true,sessions:[]}),enrollCourseSeries:vi.fn()}));
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
vi.mock("@/components/customer-labels",()=>({CustomerLabels:()=>null}));
vi.mock("@/components/operation-history-button",()=>({OperationHistoryButton:()=>null}));
vi.mock("@/server/actions/course-waitlist",()=>({promoteCourseWaitlistManually:vi.fn()}));
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
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
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="學員 更多操作"]')!.click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button=>button.textContent==="預約紀錄")!.click());
  const history=document.querySelector('[aria-labelledby="course-roster-history-title"]')!;
  expect(history.textContent).toContain("學員 · 預約紀錄");
  expect(history.textContent).toContain("2026-09-08 · 請假・不扣堂");
  expect(history.textContent).toContain("本期付款：2026-09-01 · NT$ 3,200 · 現金");
  expect(history.textContent).toContain("下期已繳 8 堂 · 2026-09-29 · NT$ 6,400 · 轉帳");
  expect(history.textContent).not.toContain("編輯本次備註");
  await act(async()=>[...history.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="關閉")!.click());
  expect(document.querySelector('[aria-labelledby="course-roster-history-title"]')).toBeNull();
  expect(host.textContent).toContain("下期已繳 8 堂");
 }finally{await act(async()=>root.unmount());host.remove();}
});
it("signs in music learners as attended in one batch and gives no makeup coupon for absence",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=[{id:"music-booking",customerName:"小安",customerId:"customer",customerPhone:"0900000000",sharedCard:false,bookingSource:"店長建立",status:"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"四堂一期",termCount:4,termLessons:[],termPrivateLeaves:[],absenceCount:0,absenceHistory:[],available:4,unit:"SESSION",notes:"",pointCost:1}];
 roster.push({...roster[0],id:"music-second",customerId:"second",customerName:"小美"});
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-27T05:00:00Z",pointCost:1,teacherAttendance:"SCHEDULED",teacherNote:""},roster,cards:[],trial:null}});
 m.quick.mockResolvedValue({success:true,data:{roster,teacherNote:"",teacherAttendance:"SCHEDULED",teacherAttendanceReason:""}});
 m.batch.mockResolvedValue({success:true});m.status.mockResolvedValue({success:true});
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"music",capacity:2,canCreate:false,canEdit:true,musicLayout:true,teacherName:"老師"})));
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="批次點名")!.click());
  expect([...host.querySelectorAll<HTMLOptionElement>('select[aria-label="批次點名狀態"] option')].map(option=>option.value)).toEqual(["ATTENDED","RESERVED","NO_SHOW"]);
  await act(async()=>host.querySelector('input[aria-label="全選搜尋結果中可操作的學員"]')!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="點名這 2 人")!.click());
  expect(m.batch).toHaveBeenLastCalledWith({sessionId:"music",target:"ATTENDED",bookings:[{id:"music-booking",status:"RESERVED"},{id:"music-second",status:"RESERVED"}]});
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="小安 更多操作"]')!.click());
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="曠課・扣堂")!.click());
  expect(m.status).toHaveBeenLastCalledWith({bookingId:"music-booking",status:"NO_SHOW",noShowChoice:"DEDUCTED"});
  expect(host.textContent).not.toContain("發補課券");
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="小安 更多操作"]')!.click());
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="標籤與備註")!.click());
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="編輯本次備註")!.click());
  const save=[...document.querySelectorAll('button[type="submit"]')].find(button=>button.textContent==="儲存")!;
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"group",capacity:15,canCreate:false,canEdit:true,musicLayout:true,classType:"GROUP",teacherName:"老師"})));
  const items=()=>[...host.querySelectorAll("section[aria-label='學員'] li")];
  await act(async()=>items()[0].querySelector<HTMLButtonElement>('button[aria-label="學員1 更多操作"]')!.click());
  act(()=>{[...document.querySelectorAll("button")].find(button=>button.textContent==="恢復待點名")!.click();});
  expect(items()[0].textContent).toContain("儲存中");
  await act(async()=>items()[1].querySelector<HTMLButtonElement>('button[aria-label="學員2 更多操作"]')!.click());
  const secondButton=[...document.querySelectorAll("button")].find(button=>button.textContent==="恢復待點名")!;
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:false,canEdit:true})));
  expect(host.querySelectorAll('input[aria-label^="選取 "]')).toHaveLength(0);
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="批次點名")!.click());
  expect(host.querySelectorAll('input[aria-label^="選取 "]')).toHaveLength(20);
  expect(host.querySelectorAll('a[href^="tel:"]')).toHaveLength(20);
  expect(host.querySelectorAll('button[aria-label$="共卡，查看預約詳情"]')).toHaveLength(1);
  expect([...host.querySelectorAll('[aria-label="學員名單捲動區"] > div > span')].some(node=>node.textContent==="共卡")).toBe(false);


  expect(host.querySelector('[aria-label="上課統計"]')?.textContent).toContain("待點名 20");
  expect(host.textContent).toContain("每 60 秒自動更新");
  expect(host.querySelector('input[placeholder="搜尋姓名或手機"]')).toBeTruthy();
  const search = host.querySelector('input[aria-label="搜尋上課學員"]') as HTMLInputElement;
  const setSearch = async (value:string) => act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,value);
    search.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await setSearch("0900000019");
  await act(async()=>(host.querySelector('input[aria-label="全選搜尋結果中可操作的學員"]') as HTMLInputElement).click());
  expect(host.textContent).toContain("點名這 1 人");
  expect(host.querySelectorAll('input[aria-label^="選取 "]:checked')).toHaveLength(1);
  await setSearch("");
  expect(host.querySelectorAll('input[aria-label^="選取 "]:checked')).toHaveLength(0);
  expect([...host.querySelectorAll("button")].filter(b=>b.getAttribute("title")==="標記出席")).toHaveLength(20);
  expect([...host.querySelectorAll("button")].filter(b=>b.textContent==="未到")).toHaveLength(0);
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="學員0 更多操作"]')!.click());
  const noShow=[...document.querySelectorAll("button")].find(b=>b.textContent==="缺席・扣堂");expect(noShow).toBeTruthy();
  await act(async()=>noShow!.click());
  expect(host.textContent).toContain("未到扣堂＋發補課券");
  const grant=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("未到扣堂＋發補課券"));expect(grant).toBeTruthy();
  await act(async()=>grant!.click());
  expect(m.status).toHaveBeenCalledWith({bookingId:"b0",status:"NO_SHOW",noShowChoice:"DEDUCTED_WITH_MAKEUP"});
  await act(async()=>(host.querySelector('input[aria-label="全選搜尋結果中可操作的學員"]') as HTMLInputElement).click());
  const apply=[...host.querySelectorAll("button")].find(b=>b.textContent==="點名這 20 人");expect(apply).toBeTruthy();
  await act(async()=>apply!.click());
  expect(m.batch).toHaveBeenCalledWith({sessionId:"session",target:"ATTENDED",bookings:roster.slice(0,20).map(b=>({id:b.id,status:b.status}))});
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:false,canEdit:true,allowTrialActions:allow})));
  const row=host.querySelector("li")!;
  const buttons=[...row.querySelectorAll("button")];
  const collect=buttons.find(b=>b.textContent?.trim()==="待收 $300");
  const correct=buttons.find(b=>b.getAttribute("aria-label")==="更正 體驗學員 收款");
  expect(row.textContent).toContain(paid?"已收 $300":"待收 $300");
  if(action==="收款"){
   expect(collect).toBeTruthy();expect(correct).toBeUndefined();
   expect(collect!.parentElement!.textContent).toContain("$300");
   await act(async()=>collect!.click());
   expect(m.collectModal).toHaveBeenCalledWith(expect.objectContaining({bookingId:"trial-booking",expectedAmount:300}),undefined);
   expect(m.correctModal).not.toHaveBeenCalled();
  }else if(action==="更正收款"){
   expect(collect).toBeUndefined();expect(correct).toBeTruthy();
   await act(async()=>correct!.click());
   await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="更正收款")!.click());
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
 vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(createElement(CourseRoster,{sessionId:"new",capacity:1,canCreate:true,canEdit:true,musicLayout:true,classType:"PRIVATE",view:"member-booking"})));
 const search=host.querySelector("#course-member-search") as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"補課");search.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("補課學員"))!.click());
 const select=host.querySelector('select[aria-label="補課紀錄"]') as HTMLSelectElement;
 expect(select.value).toBe("leave");expect(host.textContent).toContain("待補課 1 堂");
 expect([...host.querySelectorAll("select")][1].value).toBe("original");
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
 const submit=()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
 await act(async()=>{submit();});expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({cardId:"original",makeupForBookingId:"leave"}));
 await act(async()=>{select.value="";select.dispatchEvent(new Event("change",{bubbles:true}));});
 await act(async()=>{submit();});expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({makeupForBookingId:null}));
 confirm.mockRestore();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it("keeps shared post-class balance stable during attendance and rolls back a rejected save",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const base={customerPhone:"0912345678",sharedCard:true,cardId:"shared",cardRemaining:5,assignedCoachName:"黃教練",status:"RESERVED",bookingKind:"CARD",trialPayments:[],checkedInAt:null,serviceNote:"肩膀留意",notes:"",pointCost:2,available:0,unit:"POINT",termCount:0};
 const roster=[{...base,id:"one",customerId:"c1",customerName:"甲"},{...base,id:"two",customerId:"c2",customerName:"乙"}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-01T10:00:00Z",pointCost:2},roster,cards:[],trial:null}});
 m.quick.mockResolvedValue({success:true,data:{roster,teacherNote:"",teacherAttendance:"SCHEDULED",teacherAttendanceReason:""}});
 let finish!:(value:{success:false,error:string})=>void;
 m.status.mockReset().mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"shared-session",capacity:5,canCreate:false,canEdit:true})));
  const rows=()=>[...host.querySelectorAll("li")];
  expect(rows().map(row=>row.children[3].textContent)).toEqual(["1","1"]);
  expect(rows()[0].textContent).toContain("黃教練");expect(rows()[0].textContent).toContain("肩膀留意");
  act(()=>rows()[0].querySelector<HTMLButtonElement>('button[title="標記出席"]')!.click());
  expect(rows().map(row=>row.children[3].textContent)).toEqual(["1","1"]);
  expect(rows()[0].querySelector('[aria-label="甲：已出席"]')).toBeTruthy();
  await act(async()=>finish({success:false,error:"驗證拒絕"}));
  expect(rows()[0].querySelector('[aria-label="甲：待點名"]')).toBeTruthy();
  expect(rows().map(row=>row.children[3].textContent)).toEqual(["1","1"]);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('groups trial payment with identity and separates full usual and class notes',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=[{id:'dense',customerId:'dense-c',customerName:'示範學員',customerPhone:'0900000001',status:'RESERVED',bookingKind:'TRIAL',trialPrice:350,trialPayments:[],serviceNote:'長期提醒完整文字，膝蓋不適避免深蹲',notes:'今天提早離開',pointCost:0,termLessons:[],termPrivateLeaves:[],absenceHistory:[]}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:'2026-10-01T02:00:00Z',pointCost:2},roster,cards:[],trial:{canCollect:true,canCorrect:true,settings:{}}}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:'density',capacity:10,canCreate:false,canEdit:true})));
  const row=host.querySelector('li')!;
  expect(row.children[0].textContent).toContain('體驗');expect(row.children[0].textContent).toContain('待收 $350');
  expect(row.textContent).toContain('店內備註：');expect(row.textContent).toContain('本次備註：');
  expect(host.textContent).not.toContain('已預約');expect(host.textContent).not.toContain('取消整堂課');
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="示範學員 標籤與備註"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('長期提醒完整文字，膝蓋不適避免深蹲');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it.each([false,true])("keeps direct note add/edit and full notes available in the compact roster (music=%s)",async(musicLayout)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const visibleRect=vi.spyOn(HTMLElement.prototype,"getClientRects").mockImplementation(()=>[{width:100,height:44}] as unknown as DOMRectList);
 const base={customerPhone:"0900000000",status:"RESERVED",bookingKind:"CARD",trialPayments:[],pointCost:2,cardId:"plan",cardRemaining:12,serviceNote:"店內完整提醒",termLessons:[],termPrivateLeaves:[],absenceHistory:[],createdAt:"2026-10-01T02:00:00Z"};
 const roster=[{...base,id:"empty-note",customerId:"empty",customerName:"無備註學員",notes:""},{...base,id:"saved-note",customerId:"saved",customerName:"有備註學員",notes:"保留完整本次備註\n第二行"}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-10-01T02:00:00Z",pointCost:2},roster,cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:`compact-note-${musicLayout}`,capacity:10,canCreate:false,canEdit:true,musicLayout})));
  for(const booking of roster){
   const trigger=host.querySelector<HTMLButtonElement>(`button[aria-label="${booking.customerName} 本次備註"]`)!;
   expect(trigger.textContent).toBe(booking.notes ? "編輯本次備註" : "＋本次備註");
   await act(async()=>trigger.click());
   const dialog=document.querySelector("textarea")!.closest('[role="dialog"]')!;
   expect(dialog.querySelector("textarea")?.value).toBe(booking.notes);
   expect(document.activeElement).toBe(dialog.querySelector("textarea"));
   await act(async()=>[...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="取消")!.click());
   expect(document.querySelector('[role="dialog"]')).toBeNull();
  }
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="有備註學員 標籤與備註"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("店內完整提醒");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("保留完整本次備註\n第二行");
  await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:`compact-note-${musicLayout}`,capacity:10,canCreate:false,canEdit:false,musicLayout})));
  expect(host.querySelector('button[aria-label="有備註學員 本次備註"]')).toBeNull();
  expect(host.querySelector('button[aria-label="有備註學員 標籤與備註"]')).toBeTruthy();
 }finally{await act(async()=>root.unmount());host.remove();visibleRect.mockRestore();}
});

it("scopes ownership counts and retains a row after quick pending attendance", async () => {
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const base={customerPhone:"0900000000",bookingKind:"CARD",status:"RESERVED",checkedInAt:null,trialPayments:[],pointCost:2,cardId:null,cardRemaining:null,notes:"",serviceNote:"",assignedCoachName:"林教練",assignedCoachId:"coach-a"};
 const roster=[{...base,id:"owned",customerId:"one",customerName:"自己的學員"},{...base,id:"other",customerId:"two",customerName:"其他學員",assignedCoachId:"coach-b",assignedCoachName:"陳教練"}];
 const data={session:{startsAt:"2026-10-01T02:00:00Z",pointCost:2,teacherAttendance:"SCHEDULED"},roster,cards:[],trial:null};
 m.load.mockResolvedValue({success:true,data});m.quick.mockResolvedValue({success:true,data:{...data,teacherAttendance:"SCHEDULED"}});
 m.status.mockImplementation(async()=>{const updated = {...data,teacherAttendance:"SCHEDULED",roster:roster.map(row=>row.id==="owned"?{...row,status:"ATTENDED"}:row)};m.load.mockResolvedValue({success:true,data:updated});m.quick.mockResolvedValue({success:true,data:updated});return {success:true};});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"fitness",capacity:10,canCreate:false,canEdit:true,initialAssignedCoach:"coach-a"})));
  expect(host.textContent).toContain("符合 1／全班 2 位");
  expect(host.textContent).not.toContain("其他學員");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="待點名 2")!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="自己的學員：待點名"]')!.click());
  expect(host.querySelector('button[aria-label="自己的學員：已出席"]')).toBeTruthy();
  expect(host.textContent).toContain("符合 0／全班 2 位");
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("music uses shared teacher controls and hides the ownership filter", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-10-01T02:00:00Z",pointCost:1,teacherAttendance:"LEAVE"},roster:[],cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"music",capacity:10,canCreate:false,canEdit:true,musicLayout:true,teacherName:"林老師"})));
  expect(host.querySelector('select[aria-label="教師出勤狀態"]')).toBeTruthy();
  expect(host.querySelector('select[aria-label="所屬店長篩選"]')).toBeNull();
  expect(host.textContent).toContain("本堂免點名");
 } finally {await act(async()=>root.unmount());host.remove();}
});


it("combines pending attendance with unpaid trials and keeps whole-class counters", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const base={customerPhone:"0900000000",bookingKind:"TRIAL",status:"RESERVED",checkedInAt:null,trialPayments:[],trialPrice:350,pointCost:0,notes:"",serviceNote:""};
 const roster=[{...base,id:"pending-unpaid",customerId:"one",customerName:"待點名未收款"},{...base,id:"attended-unpaid",customerId:"two",customerName:"已出席未收款",status:"ATTENDED"},{...base,id:"pending-paid",customerId:"three",customerName:"待點名已收款",trialPayments:[{status:"SUCCESS",amount:350}]}];
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-10-01T02:00:00Z",pointCost:2,teacherAttendance:"SCHEDULED"},roster,cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent===text)!.click());
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"filter-combined",capacity:10,canCreate:false,canEdit:true})));
  const filters=host.querySelector<HTMLElement>('[aria-label="名單篩選條件"]')!;
  expect(filters.hidden).toBe(true);
  await click("篩選");expect(filters.hidden).toBe(false);
  await click("篩選");expect(filters.hidden).toBe(true);
  await click("待點名 2");await click("未收款 2");
  expect(host.querySelectorAll("li")).toHaveLength(1);
  expect(host.querySelector("li")?.textContent).toContain("待點名未收款");
  expect(host.textContent).toContain("符合 1／全班 3 位");
  expect(host.textContent).toContain("點名：待點名");expect(host.textContent).toContain("收款：體驗未收款");
  const stats=host.querySelector('[aria-label="上課統計"]')!;
  expect(stats.textContent).toContain("待點名 2");expect(stats.textContent).toContain("未收款 2");
  expect(stats.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(2);
  await click("批次點名");
  const selectAll=host.querySelector<HTMLInputElement>('input[aria-label="全選搜尋結果中可操作的學員"]')!;
  await act(async()=>selectAll.click());
  expect(host.textContent).toContain("點名這 1 人");
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="移除點名：待點名"]')!.click());
  expect(host.querySelectorAll("li")).toHaveLength(2);
  expect(filters.hidden).toBe(true);
  await click("清除篩選");expect(host.querySelectorAll("li")).toHaveLength(3);
  expect(host.textContent).toContain("已選 0 人");
 } finally {await act(async()=>root.unmount());host.remove();}
});

it("hides zero pending counts and hides the legend on an empty fitness roster", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const session={startsAt:"2026-10-01T02:00:00.000Z",pointCost:2,teacherAttendance:"SCHEDULED",teacherNote:""};
 const data=(roster:unknown[])=>({success:true,data:{session,roster,cards:[],trial:null}});
 m.load.mockResolvedValue(data([]));
 try{
  await act(async()=>root.render(createElement(CourseRoster,{key:"empty",sessionId:"empty",capacity:10,canCreate:false,canEdit:true})));
  expect(host.textContent).not.toContain("○ 待點名");
  expect([...host.querySelectorAll("button")].some(b=>b.textContent?.startsWith("待點名"))).toBe(false);
  m.load.mockResolvedValue(data([{id:"attended",customerId:"one",customerName:"已處理",customerPhone:"",status:"ATTENDED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],available:8,unit:"POINT",notes:"",pointCost:2}]));
  await act(async()=>root.render(createElement(CourseRoster,{key:"complete",sessionId:"complete",capacity:10,canCreate:false,canEdit:true})));
  expect([...host.querySelectorAll("button")].some(b=>b.textContent?.startsWith("待點名"))).toBe(false);
  expect(host.textContent).toContain("○ 待點名");
 }finally{await act(async()=>root.unmount());host.remove();}
});


it("uses one neutral touch-open indicator for shared authorization and proxy operation, with live details", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const longName="姓名很長的學員".repeat(10);
 const base={customerPhone:"0900000001",status:"RESERVED",bookingKind:"CARD",trialPayments:[],planName:"舊有共用方案",notes:"",serviceNote:"",pointCost:1,termLessons:[],termPrivateLeaves:[],absenceHistory:[],createdAt:"2026-10-01T02:00:00Z"};
 const roster=[
  {...base,id:"shared",customerId:"a",customerName:longName,sharedCard:true,operatorCustomerId:"a",bookingSource:"本人預約",operatorName:longName},
  {...base,id:"proxy",customerId:"b",customerName:"乙",sharedCard:false,operatorCustomerId:"a",bookingSource:"甲代約",operatorName:"甲"},
  {...base,id:"both",customerId:"c",customerName:"丙",sharedCard:true,operatorCustomerId:"a",bookingSource:"甲代約",operatorName:"甲"},
  {...base,id:"companion",customerId:null,customerName:"同行者",sharedCard:false,operatorCustomerId:"a",companionIndex:1,bookingSource:"同行 · 預約人 甲",operatorName:"甲"},
 ];
 const data={sharedCardState:"ENABLED",session:{startsAt:"2026-10-01T02:00:00Z",pointCost:1},roster,cards:[],trial:null};
 m.load.mockResolvedValue({success:true,data});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"shared-context",capacity:8,canCreate:false,canEdit:false})));
  const rows=[...host.querySelectorAll("li")];
  const indicators=rows.map(row=>[...row.querySelectorAll<HTMLButtonElement>('button[aria-label$="查看預約詳情"]')]);
  expect(indicators.map(row=>row.map(button=>button.textContent))).toEqual([["共卡"],["代約"],["共卡・代約"],[]]);
  expect(rows.every(row=>row.children.length===5)).toBe(true);
  expect(indicators.flat().every(button=>button.className.includes("text-earth-600")&&!button.hasAttribute("title"))).toBe(true);
  // Structural/jsdom regression only: real CSS row height is not measured here.
  for (const flow of host.querySelectorAll<HTMLElement>("[data-roster-name-flow]")) {
    expect(flow.className).toContain("flex-nowrap");expect(flow.className).toContain("max-w-full");
    for (const control of flow.querySelectorAll<HTMLButtonElement>("button")) {
      if (control.hasAttribute("data-sports-roster-name")) {
        expect(control.className).toContain("min-h-11");
        expect(control.className).not.toContain("after:-inset-y-2.5");
      } else {
        expect(control.className).not.toContain("min-h-11");expect(control.className).toContain("h-6");
        expect(control.className).toContain("after:inset-x-0");expect(control.className).toContain("after:-inset-y-2.5");
      }
    }
  }
  expect(rows[0].querySelector('[data-roster-name-flow] > button > span')?.className).toContain("truncate");

  indicators[2][0].focus();await act(async()=>indicators[2][0].click());
  let dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("共卡：此方案由既有授權成員共用餘額");
  expect(dialog.textContent).toContain("代約：由 甲 協助預約，上課人為 丙");
  await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(indicators[2][0]);
  await act(async()=>indicators[0][0].click());
  dialog=document.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain(longName);expect(dialog.textContent).not.toContain("上課人為 丙");
  m.load.mockResolvedValue({success:true,data:{...data,sharedCardState:"HIDDEN"}});
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"hidden-context",capacity:8,canCreate:false,canEdit:false})));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect([...host.querySelectorAll<HTMLButtonElement>('button[aria-label$="查看預約詳情"]')].map(button=>button.textContent)).toEqual(["代約","代約"]);
  await act(async()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${longName} 預約詳情"]`)!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("共卡：此方案由既有授權成員共用餘額");
 } finally {await act(async()=>root.unmount());host.remove();}
});


it.each(["HIDDEN","LOCKED"] as const)("does not offer new companions from stale row metadata when %s",async(sharedCardState)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const base={customerPhone:"0900000001",status:"RESERVED",bookingKind:"CARD",trialPayments:[],planName:"既有方案",notes:"",serviceNote:"",pointCost:1,termLessons:[],termPrivateLeaves:[],absenceHistory:[],createdAt:"2026-10-01T02:00:00Z",canAddCompanion:true};
 const roster=[{...base,id:"self-stale",customerId:"self",customerName:"本人"},{...base,id:"existing-companion",customerId:null,customerName:"既有同行",companionIndex:1}];
 m.load.mockResolvedValue({success:true,data:{sharedCardState,session:{startsAt:"2026-10-01T02:00:00Z",pointCost:1},roster,cards:[],trial:null}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:`stale-companion-${sharedCardState}`,capacity:8,canCreate:true,canEdit:true})));
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="本人 更多操作"]')!.click());
  expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("新增同行");
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="既有同行 更多操作"]')!.click());
  expect(document.querySelector('[role="menu"]')?.textContent).toContain("變更使用方式");
 } finally {await act(async()=>root.unmount());host.remove();}
});
