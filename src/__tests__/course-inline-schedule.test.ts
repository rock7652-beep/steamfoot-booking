// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {CourseScheduleLearners} from "@/components/admin/course-schedule-learners";
const mocks=vi.hoisted(()=>({check:vi.fn().mockResolvedValue({success:true,issues:[]}),createCustomer:vi.fn(),create:vi.fn(),slots:vi.fn(),options:vi.fn()}));
vi.mock("@/server/actions/course-schedule-check",()=>({inspectCourseSchedule:mocks.check}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:mocks.create}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:mocks.slots}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:mocks.options,createScheduleCustomer:mocks.createCustomer}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

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
    await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="＋建立新學員")!.click());
    for(const [label,value] of [["新學員姓名","新學員"],["新學員手機","0912345678"]]){const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);await act(async()=>input.dispatchEvent(new Event("input",{bubbles:true})));}
    const create=[...host.querySelectorAll("button")].find(b=>b.textContent==="建立並加入")!;
    await act(async()=>create.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="新學員姓名"]')!.value).toBe("新學員");
    expect(host.textContent).toContain("手機格式錯誤");
    await act(async()=>create.click());
    expect(change).toHaveBeenCalledWith([{customerId:"new",name:"新學員",cardId:"",trialPrice:300}]);
  }finally{await act(async()=>root.unmount());}
});
