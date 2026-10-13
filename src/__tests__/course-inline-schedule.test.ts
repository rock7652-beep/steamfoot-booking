// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {MusicScheduleWizard} from "@/app/(dashboard)/dashboard/courses/music-schedule-wizard";
import {CourseScheduleLearners} from "@/components/admin/course-schedule-learners";
const mocks=vi.hoisted(()=>({check:vi.fn().mockResolvedValue({success:true,issues:[]}),createCustomer:vi.fn(),create:vi.fn(),slots:vi.fn(),options:vi.fn()}));
vi.mock("@/server/actions/course-schedule-check",()=>({inspectCourseSchedule:mocks.check}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:mocks.create}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:mocks.slots}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:mocks.options,createScheduleCustomer:mocks.createCustomer}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

it("keeps the clicked room/time after changing the course and submits multiple learners in one save",async()=>{
  mocks.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"room",coachIds:["teacher"]}]});
  mocks.options.mockResolvedValue({success:true,cards:[{id:"card-a",name:"吉他4堂",unit:"SESSION",available:4,expiresAt:"2099-12-31T00:00:00Z",members:[{id:"a",name:"小安",phone:"0911111111"}]},{id:"card-b",name:"吉他4堂",unit:"SESSION",available:4,expiresAt:"2099-12-31T00:00:00Z",members:[{id:"b",name:"小明",phone:"0922222222"}]}]});
  mocks.create.mockResolvedValue({success:true,data:{sessionId:"saved",sessions:[]}});
  const onCreated=vi.fn();
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(createElement(MusicScheduleWizard,{templates:[{id:"first",musicSubjectId:"guitar",musicSubject:{id:"guitar",name:"吉他",isActive:true},name:"雙人課",durationMinutes:60,capacity:2,defaultRoomId:null},{id:"second",musicSubjectId:"guitar",musicSubject:{id:"guitar",name:"吉他",isActive:true},name:"三人課",durationMinutes:60,capacity:3,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"}],initialDate:"2099-10-01",seed:{date:"2099-10-01",time:"18:00",roomId:"room"},requestKey:"00000000-0000-4000-8000-000000000017",onCreated})));
    expect(host.querySelector('input[type="date"]')).toBeNull();
    expect(host.querySelector('[aria-label="老師可用教室"]')).toBeNull();
    expect(host.querySelector('[aria-label="已選排課位置"]')!.textContent).toContain("A教室");
    const select=host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!;select.value="second";
    await act(async()=>select.dispatchEvent(new Event("change",{bubbles:true})));
    for(const name of ["小安","小明"]){
      const search=host.querySelector<HTMLInputElement>('[aria-label="搜尋排課學員"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,name);
      await act(async()=>search.dispatchEvent(new Event("input",{bubbles:true})));
      const add=[...host.querySelectorAll("button")].find(button=>button.textContent?.startsWith(name)&&button.textContent?.endsWith("＋"))!;
      expect(add).toBeTruthy();await act(async()=>add.click());
    }
    expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("2 / 3 人");
    expect(host.querySelector('select[aria-label="小安的方案"]')).toBeNull();
    expect(host.querySelector('[aria-label="合格老師與可用教室"]')!.textContent).toContain("王老師");
    expect(host.querySelector('[aria-label="合格老師與可用教室"]')!.querySelector("button")).toBeNull();
    select.value="first";
    await act(async()=>select.dispatchEvent(new Event("change",{bubbles:true})));
    select.value="second";
    await act(async()=>select.dispatchEvent(new Event("change",{bubbles:true})));
    expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("小安");
    expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("小明");
    const save=[...host.querySelectorAll("button")].find(button=>button.textContent==="新增單次課程")!;
    await act(async()=>save.click());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({templateId:"second",roomId:"room",time:"18:00",coachId:"teacher",learners:[{customerId:"a",cardId:"card-a"},{customerId:"b",cardId:"card-b"}]}));
    expect(onCreated).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());host.remove();}
});

it("blocks a selected learner whose plan cannot cover every class in the batch",async()=>{
  mocks.options.mockResolvedValue({success:true,cards:[{id:"card-a",name:"吉他方案",unit:"SESSION",available:2,expiresAt:"2099-12-31T00:00:00Z",members:[{id:"a",name:"小安",phone:"0911111111"}]}]});
  const onValidityChange=vi.fn();
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(CourseScheduleLearners,{templateId:"guitar",pointCost:1,capacity:2,occurrenceCount:3,value:[{customerId:"a",cardId:"card-a",name:"小安"}],onChange:vi.fn(),onValidityChange})));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("可用額度");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  }finally{await act(async()=>root.unmount());host.remove();}
});


it("does not show an empty teacher chooser when the clicked room is unavailable",async()=>{
  mocks.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"other-room",coachIds:["teacher"]}]});
  mocks.options.mockResolvedValue({success:true,cards:[]});
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(MusicScheduleWizard,{templates:[{id:"guitar",name:"吉他雙人課",durationMinutes:60,capacity:2,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"}],initialDate:"2099-10-01",seed:{time:"18:00",roomId:"room"},requestKey:"test-request",onCreated:vi.fn()})));
    expect(host.querySelector('[aria-label="合格老師與可用教室"]')).toBeNull();
    expect(host.querySelector('[aria-label="已選排課位置"]')!.textContent).toContain("18:00–19:00 · A教室");
    expect(host.textContent).toContain("此教室目前無法排入");
    expect([...host.querySelectorAll("button")].find(button=>button.textContent==="新增單次課程")!.disabled).toBe(true);
  }finally{await act(async()=>root.unmount());host.remove();}
});

it("keeps the clicked teacher when unavailable instead of silently replacing them, and defaults to sixty minutes",async()=>{
  mocks.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"room",coachIds:["other"]}],unavailable:[{time:"09:00",reason:"非營業時段",fixTarget:"hours"}]});
  mocks.options.mockResolvedValue({success:true,cards:[]});
  const host=document.createElement("div");const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(MusicScheduleWizard,{templates:[{id:"guitar",name:"吉他課",durationMinutes:90,capacity:1,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"},{id:"other",displayName:"李老師"}],initialDate:"2099-10-01",seed:{time:"18:00",coachId:"teacher",durationMinutes:30},requestKey:"test-request",onCreated:vi.fn()})));
    expect(host.querySelector('[aria-label="已選排課位置"]')!.textContent).toContain("18:00–19:00");
    expect(host.querySelector('[aria-label="已選排課位置"]')!.textContent).toContain("王老師");
    expect(host.textContent).not.toContain("設定營業時間");
    const save=[...host.querySelectorAll("button")].find(b=>b.textContent==="新增單次課程")!;
    expect(save.disabled).toBe(true);
    const other=host.querySelector<HTMLSelectElement>('[aria-label="授課老師"]')!;
    other.value="other";await act(async()=>other.dispatchEvent(new Event("change",{bubbles:true})));
    expect(save.disabled).toBe(false);
  }finally{await act(async()=>root.unmount());}
});

it("blocks the fixed schedule when any generated date conflicts",async()=>{
  mocks.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"room",coachIds:["teacher"]}]});
  mocks.options.mockResolvedValue({success:true,cards:[]});
  mocks.check.mockResolvedValue({success:true,issues:[{date:"2099-10-08",reason:"老師已有課"}]});
  mocks.create.mockClear().mockResolvedValue({success:true,data:{sessionId:"saved",sessions:[]}});
  const host=document.createElement("div");const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(MusicScheduleWizard,{templates:[{id:"guitar",name:"吉他團班",durationMinutes:60,capacity:10,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"}],initialDate:"2099-10-01",seed:{time:"18:00",roomId:"room"},requestKey:"test-request",initialScheduleKind:"FIXED",onCreated:vi.fn()})));
    await act(async()=>new Promise(resolve=>setTimeout(resolve,160)));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="排課衝突日期"]')!.textContent).toContain("2099-10-08");
    const save=[...host.querySelectorAll("button")].find(b=>b.textContent==="新增固定課程")!;
    expect(save.disabled).toBe(true);
  }finally{await act(async()=>root.unmount());}
});

it("counts all shared-card learners against the batch credit total",async()=>{
  mocks.options.mockResolvedValue({success:true,cards:[{id:"shared",name:"共卡",unit:"SESSION",available:3,members:[{id:"a",name:"小安",phone:"0911111111"},{id:"b",name:"小明",phone:"0922222222"}]}]});
  const valid=vi.fn();const host=document.createElement("div");const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(CourseScheduleLearners,{templateId:"guitar",pointCost:1,capacity:2,occurrenceCount:2,value:[{customerId:"a",cardId:"shared",name:"小安"},{customerId:"b",cardId:"shared",name:"小明"}],onChange:vi.fn(),onValidityChange:valid})));
    expect(valid).toHaveBeenLastCalledWith(false);
  }finally{await act(async()=>root.unmount());}
});

it("creates and adds a trial learner inline while retaining the draft on failure",async()=>{
  mocks.options.mockResolvedValue({success:true,cards:[],customers:[],trialSettings:{enabled:true,price:300}});
  mocks.createCustomer.mockResolvedValueOnce({success:false,error:"手機格式錯誤"}).mockResolvedValue({success:true,customer:{id:"new",name:"新學員",phone:"0912345678",existing:false}});
  const change=vi.fn();const host=document.createElement("div");const root=createRoot(host);
  try{
    await act(async()=>root.render(createElement(CourseScheduleLearners,{templateId:"guitar",pointCost:1,capacity:2,value:[],onChange:change,trialMode:true,canCreateCustomer:true})));
    await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="＋新增學員")!.click());
    for(const [label,value] of [["新學員姓名","新學員"],["新學員手機","0912345678"]]){const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);await act(async()=>input.dispatchEvent(new Event("input",{bubbles:true})));}
    const create=[...host.querySelectorAll("button")].find(b=>b.textContent==="建立並加入")!;
    await act(async()=>create.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="新學員姓名"]')!.value).toBe("新學員");
    expect(host.textContent).toContain("手機格式錯誤");
    await act(async()=>create.click());
    expect(change).toHaveBeenCalledWith([{customerId:"new",name:"新學員",cardId:"",trialPrice:300}]);
  }finally{await act(async()=>root.unmount());}
});

it("shares edited positions with other purposes without losing the unsaved-change guard",async()=>{
 mocks.slots.mockResolvedValue({success:true,data:[{time:"18:00",roomId:"room",coachIds:["teacher"]},{time:"19:00",roomId:"room",coachIds:["teacher"]}]});
 mocks.options.mockResolvedValue({success:true,cards:[]});
 const onPositionChange=vi.fn(),onGuard=vi.fn();const host=document.createElement("div");const root=createRoot(host);
 const props={templates:[{id:"guitar",name:"吉他課",durationMinutes:60,capacity:1,defaultRoomId:null}],rooms:[{id:"room",name:"A教室"}],coaches:[{id:"teacher",displayName:"王老師"}],initialDate:"2099-10-01",seed:{time:"18:00",roomId:"room"},requestKey:"test",onCreated:vi.fn(),onPositionChange,onGuard};
 try{
  await act(async()=>root.render(createElement(MusicScheduleWizard,props)));
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="修改")!.click());
  const time=host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(time,"19:00");
  await act(async()=>time.dispatchEvent(new Event("input",{bubbles:true})));
  expect(onPositionChange).toHaveBeenLastCalledWith(expect.objectContaining({time:"19:00",roomId:"room",durationMinutes:60}));
  await act(async()=>root.render(createElement(MusicScheduleWizard,{...props,seed:{time:"19:00",roomId:"room"}})));
  expect(onGuard).toHaveBeenLastCalledWith(true,false);
 }finally{await act(async()=>root.unmount());}
});
