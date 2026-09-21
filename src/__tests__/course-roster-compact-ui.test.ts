// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),batch:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course-members",()=>({loadCourseSessionDetail:m.load,updateCourseRosterBatch:m.batch,createCourseBooking:vi.fn(),updateCourseBookingStatus:vi.fn(),cancelCourseSession:vi.fn()}));
vi.mock("@/server/actions/course-trial",()=>({createCourseTrial:vi.fn(),collectCourseTrial:vi.fn(),voidCourseTrialPayment:vi.fn()}));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal",()=>({CollectTrialModal:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal",()=>({CorrectTrialCollectionModal:()=>null}));
import {CourseRoster} from "@/app/(dashboard)/dashboard/courses/roster";
it("shows all twenty compact rows and selects them for one batch without cancelled bookings",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const roster=Array.from({length:21},(_,i)=>({id:`b${i}`,customerName:`學員${i}`,customerId:`c${i}`,status:i===20?"CANCELLED":"RESERVED",bookingKind:"CARD",checkedInAt:null,trialPayments:[],planName:"十堂",available:10,expiresAt:"2099-01-01T00:00:00Z",serviceNote:"內部備註",notes:"本次備註",pointCost:1}));
 m.load.mockResolvedValue({success:true,data:{session:{startsAt:"2026-09-01T00:00:00Z",pointCost:1},roster,cards:[],trial:null}});m.batch.mockResolvedValue({success:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseRoster,{sessionId:"session",capacity:20,canCreate:false,canEdit:true})));
  expect(host.querySelectorAll('input[aria-label^="選取 "]')).toHaveLength(20);
  expect(host.querySelectorAll("details[open]")).toHaveLength(0);
  await act(async()=>(host.querySelector('input[aria-label="全選全班學員"]') as HTMLInputElement).click());
  const apply=[...host.querySelectorAll("button")].find(b=>b.textContent==="套用 20 人");expect(apply).toBeTruthy();
  await act(async()=>apply!.click());
  expect(m.batch).toHaveBeenCalledWith({sessionId:"session",target:"CHECKED_IN",bookings:roster.slice(0,20).map(b=>({id:b.id,status:b.status}))});
 }finally{await act(async()=>root.unmount());host.remove();}
});
