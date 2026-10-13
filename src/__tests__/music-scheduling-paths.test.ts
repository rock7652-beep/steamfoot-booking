// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({slots:vi.fn(),check:vi.fn(),create:vi.fn(),options:vi.fn()}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:m.slots}));
vi.mock("@/server/actions/course-schedule-check",()=>({inspectCourseSchedule:m.check}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:m.create}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:m.options,createScheduleCustomer:vi.fn()}));
import {MusicScheduleWizard} from "@/app/(dashboard)/dashboard/courses/music-schedule-wizard";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const props={templates:[{id:"guitar",name:"吉他",musicSubjectId:"subject",musicSubject:{id:"subject",name:"吉他教學",isActive:true},durationMinutes:60,capacity:1,defaultRoomId:null},{id:"trial",name:"體驗吉他",musicTrialMode:"PAID",musicSubjectId:"subject",musicSubject:{id:"subject",name:"吉他教學",isActive:true},durationMinutes:60,capacity:1,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"},{id:"other",displayName:"李老師"}],initialDate:"2099-10-01",seed:{time:"18:00",roomId:"room"},requestKey:"00000000-0000-4000-8000-000000000017",onCreated:vi.fn()};
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.resetAllMocks();m.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"room",coachIds:["teacher"]}],unavailable:[]});m.check.mockResolvedValue({success:true,issues:[]});m.create.mockResolvedValue({success:true,data:{sessionId:"saved",sessions:[]}});m.options.mockResolvedValue({success:true,cards:[],customers:[{id:"a",name:"小安",phone:"0911111111"},{id:"b",name:"小明",phone:"0922222222"}],trialSettings:{enabled:true,price:300}});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(extra:Partial<Parameters<typeof MusicScheduleWizard>[0]>={}){await act(async()=>root.render(createElement(MusicScheduleWizard,{...props,...extra})));}
async function input(label:string,value:string){const el=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;expect(el).toBeTruthy();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
async function select(label:string,value:string){const el=host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;expect(el).toBeTruthy();await act(async()=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));});}
async function mode(label:string){await act(async()=>[...host.querySelectorAll("label")].find(el=>el.textContent===label)!.querySelector<HTMLInputElement>("input")!.click());}
async function add(name:string){await input("搜尋排課學員",name);await act(async()=>[...host.querySelectorAll("button")].find(el=>el.textContent?.startsWith(name)&&el.textContent?.endsWith("＋"))!.click());}
async function finishCheck(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});}
async function save(){await finishCheck();const button=[...host.querySelectorAll<HTMLButtonElement>("footer button")].find(el=>el.textContent==="新增")!;expect(button.disabled).toBe(false);await act(async()=>button.click());}
it("requires assigned learners before course selection and submits each unpaid learner without a capacity input",async()=>{
 await mount();expect(host.querySelector('[aria-label="課程"]')).toBeNull();expect(m.options).toHaveBeenCalledWith("");expect(m.slots).not.toHaveBeenCalled();
 await add("小安");await add("小明");expect(host.querySelector('[aria-label="名額"]')).toBeNull();
 const learner=host.querySelector('[aria-label="排課學員"]')!,course=host.querySelector('[aria-label="課程"]')!;
 expect(learner.compareDocumentPosition(course)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 await select("課程","guitar");expect(host.textContent).toContain("無適用方案");await save();
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({enrollmentMode:"ASSIGNED",capacity:2,learners:[{customerId:"a",cardId:null},{customerId:"b",cardId:null}]}));
});
it("creates open registration without any learner and places capacity after the qualified teacher",async()=>{
 await mount();await mode("開放報名");await select("課程","guitar");await input("名額","8");
 const teacher=host.querySelector('[aria-label="授課老師"]')!,capacity=host.querySelector('[aria-label="名額"]')!;
 expect(teacher.compareDocumentPosition(capacity)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();await save();
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({enrollmentMode:"OPEN",capacity:8,learners:[]}));
});
it("keeps the assigned draft when switching paths but never sends it with open registration",async()=>{
 await mount();await add("小安");await select("課程","guitar");await mode("開放報名");await save();
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({learners:[]}));await mode("指定學員");expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("小安");
});
it("keeps regular and trial learner drafts separately across type changes",async()=>{
 await mount();await add("小安");await select("課程","guitar");await mount({isTrial:true});await add("小明");await select("課程","trial");await mount({isTrial:false});
 expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("小安");expect(host.querySelector('[aria-label="排課學員"]')!.textContent).not.toContain("小明");
 await mount({isTrial:true});expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("小明");
});
it("uses the clicked teacher and requires a change when that teacher is unavailable",async()=>{
 await mount({seed:{time:"18:00",roomId:"room",coachId:"other"}});await mode("開放報名");await select("課程","guitar");
 expect(host.querySelector<HTMLSelectElement>('[aria-label="授課老師"]')!.value).toBe("other");await finishCheck();expect(host.querySelector<HTMLButtonElement>('footer button')!.disabled).toBe(true);
 await select("授課老師","teacher");await save();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({coachId:"teacher"}));
});
it("creates an ongoing biweekly rule without an expiry or lesson count",async()=>{
 await mount({initialScheduleKind:"FIXED"});await mode("開放報名");await select("課程","guitar");await select("固定課程頻率","BIWEEKLY");
 expect(host.querySelector('[aria-label="固定課程有效期限"]')).toBeNull();expect(host.textContent).toContain("直到取消後續");await save();
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({scheduleType:"FIXED",scheduleFrequency:"BIWEEKLY",additionalDates:expect.arrayContaining(["2099-10-15"])}));expect(m.create.mock.calls[0][0].fixedUntil).toBeUndefined();
});
it("reports a later single-course collision without dropping that date",async()=>{
 m.check.mockResolvedValue({success:true,issues:[{date:"2099-10-08",reason:"教室已有課"}]});await mount();await mode("開放報名");await select("課程","guitar");await input("單次課安排週數","3");await finishCheck();
 expect(host.querySelector('[aria-label="排課衝突日期"]')!.textContent).toContain("2099-10-08 · 教室已有課");expect(host.querySelector<HTMLButtonElement>('footer button')!.disabled).toBe(true);expect(m.create).not.toHaveBeenCalled();
 expect(m.check).toHaveBeenCalledWith(expect.objectContaining({additionalDates:["2099-10-08","2099-10-15"]}));
});
it("allows position edits and cancellation while a teacher request is pending, ignoring the old response",async()=>{
 let finish!:(value:unknown)=>void;m.slots.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const onCancel=vi.fn();await mount({onCancel});await mode("開放報名");await select("課程","guitar");
 await input("排課時間","19:00");await act(async()=>[...host.querySelectorAll("footer button")].find(el=>el.textContent==="取消")!.dispatchEvent(new MouseEvent("click",{bubbles:true})));expect(onCancel).toHaveBeenCalled();
 await act(async()=>finish({success:true,data:[{time:"18:00",roomId:"room",coachIds:["other"]}]}));expect(host.querySelector<HTMLSelectElement>('[aria-label="授課老師"]')!.value).toBe("");expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe("19:00");
});
it("does not throw when the date or week count is cleared",async()=>{await mount();await input("排課日期","");await input("單次課安排週數","");expect(host.textContent).toContain("請選擇時間與教室");});

it("updates each trial learner to the selected course's configured fee",async()=>{
 m.options.mockImplementation(async(templateId:string)=>({success:true,cards:[],customers:[{id:"a",name:"小安",phone:"0911111111"}],trialSettings:{enabled:true,price:templateId==="trial"?650:300}}));
 await mount({isTrial:true});await add("小安");await select("課程","trial");await save();
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({isTrial:true,learners:[{customerId:"a",cardId:null,trialPrice:650}]}));
});


it("waits for the course before reporting a plan and resolves each learner independently",async()=>{
 const customers=[{id:"a",name:"小安",phone:"0911111111"},{id:"b",name:"小明",phone:"0922222222"}];
 m.options.mockImplementation(async(templateId:string)=>({success:true,customers,cards:templateId?[{id:"card-a",name:"吉他個人方案",unit:"SESSION",available:3,expiresAt:"2099-12-31T00:00:00Z",members:[customers[0]]}]:[],trialSettings:{enabled:true,price:300}}));
 await mount();await add("小安");await add("小明");expect(host.textContent).toContain("選課後確認適用方案");expect(host.textContent).not.toContain("無適用方案");
 await select("課程","guitar");expect(host.querySelector<HTMLSelectElement>('[aria-label="小安的方案"]')!.value).toBe("card-a");expect(host.textContent).toContain("有效至 2099-12-31");expect(host.textContent).toContain("無適用方案");
 await save();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({learners:[{customerId:"a",cardId:"card-a"},{customerId:"b",cardId:null}]}));
 await select("小安的方案","");await save();expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({learners:[{customerId:"a",cardId:null},{customerId:"b",cardId:null}]}));
});
it("does not use a plan expiring before the selected class date",async()=>{
 m.options.mockImplementation(async(templateId:string)=>({success:true,customers:[{id:"a",name:"小安",phone:"0911111111"}],cards:templateId?[{id:"expired-for-class",name:"到期方案",unit:"SESSION",available:3,expiresAt:"2099-09-30T00:00:00Z",members:[{id:"a",name:"小安",phone:"0911111111"}]}]:[],trialSettings:{enabled:true,price:300}}));
 await mount();await add("小安");await select("課程","guitar");expect(host.querySelector<HTMLSelectElement>('[aria-label="小安的方案"]')!.value).toBe("");await save();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({learners:[{customerId:"a",cardId:null}]}));
});
it("explains an empty trial catalog and provides a settings link without losing the learner",async()=>{
 await mount({isTrial:true,templates:props.templates.filter(t=>t.id!=="trial")});await add("小安");expect(host.textContent).toContain("尚無可安排的體驗課");expect(host.querySelector<HTMLAnchorElement>('a[href="/dashboard/courses?view=catalog"]')!.target).toBe("_blank");expect(host.textContent).toContain("小安");
});
it("summarizes repeat dates and identifies a class ending on the following day",async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:"23:30",roomId:"room",coachIds:["teacher"]}]});await mount({seed:{time:"23:30",roomId:"room"}});await mode("開放報名");await select("課程","guitar");await input("單次課安排週數","3");
 const summary=host.querySelector('[aria-label="新增前確認"]')!;expect(summary.textContent).toContain("23:30–00:30（隔日）");expect(summary.textContent).toContain("2099-10-15");
});
it("blocks synchronous double clicks while the same save is running",async()=>{
 let finish!:(value:unknown)=>void;m.create.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await mount();await mode("開放報名");await select("課程","guitar");await finishCheck();
 const button=host.querySelector<HTMLButtonElement>('footer button')!;await act(async()=>{button.click();button.click();});expect(m.create).toHaveBeenCalledTimes(1);await act(async()=>finish({success:false,error:"連線逾時"}));expect(host.textContent).toContain("連線逾時");await save();expect(m.create).toHaveBeenCalledTimes(2);await act(async()=>finish({success:true,data:{sessionId:"saved",sessions:[]}}));
});

it("only lists active courses linked to enabled teaching items",async()=>{
 await mount({templates:[...props.templates,{id:"legacy",name:"虛構驗收舊課",durationMinutes:60,capacity:1,defaultRoomId:null},{...props.templates[0],id:"inactive",musicSubject:{id:"subject",name:"停用項目",isActive:false}},{...props.templates[0],id:"off",visibility:"OFF"}]});await mode("開放報名");
 const options=Array.from(host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!.options).map(option=>option.value);expect(options).toEqual(["","guitar"]);
});
