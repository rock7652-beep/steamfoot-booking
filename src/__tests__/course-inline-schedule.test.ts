// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {MusicScheduleWizard} from "@/app/(dashboard)/dashboard/courses/music-schedule-wizard";
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
    expect(host.querySelector('[aria-label="已選排課位置"]')!.textContent).toContain("18:00 · A教室");
    const select=host.querySelectorAll("select")[1];select.value="second";
    await act(async()=>select.dispatchEvent(new Event("change",{bubbles:true})));
    for(const name of ["小安","小明"]){
      const search=host.querySelector<HTMLInputElement>('[aria-label="搜尋排課學員"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,name);
      await act(async()=>search.dispatchEvent(new Event("input",{bubbles:true})));
      const add=[...host.querySelectorAll("button")].find(button=>button.textContent===name+"＋")!;
      expect(add).toBeTruthy();await act(async()=>add.click());
    }
    expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain("2 / 3 人");
    const save=[...host.querySelectorAll("button")].find(button=>button.textContent==="儲存排課")!;
    await act(async()=>save.click());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({templateId:"second",roomId:"room",time:"18:00",coachId:"teacher",learners:[{customerId:"a",cardId:"card-a"},{customerId:"b",cardId:"card-b"}]}));
    expect(onCreated).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());host.remove();}
});
