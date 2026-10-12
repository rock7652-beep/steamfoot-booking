// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {MusicScheduleWizard} from "@/app/(dashboard)/dashboard/courses/music-schedule-wizard";
import {CourseScheduleLearners} from "@/components/admin/course-schedule-learners";
const mocks=vi.hoisted(()=>({create:vi.fn(),slots:vi.fn(),options:vi.fn()}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:mocks.create}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:mocks.slots}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:mocks.options}));
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
      const add=[...host.querySelectorAll("button")].find(button=>button.textContent===name+"＋")!;
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
    const save=[...host.querySelectorAll("button")].find(button=>button.textContent==="儲存排課")!;
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
    expect(host.textContent).toContain("此時段沒有可用老師或教室");
    expect([...host.querySelectorAll("button")].find(button=>button.textContent==="儲存排課")!.disabled).toBe(true);
  }finally{await act(async()=>root.unmount());host.remove();}
});
