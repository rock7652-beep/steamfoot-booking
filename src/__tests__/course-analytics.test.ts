import { describe, expect, it } from "vitest";
import { courseAnalysisRange, courseAnalysisPriorYear, previousCourseAnalysisRange, summarizeCourseAttendance, type CourseAnalysisSession } from "@/lib/course-analytics";
const range={startDate:"2026-09-17",endDate:"2026-09-17"};
const booking=(id:string,status:string,unit="POINT",points=3)=>({customerId:id,customerName:id,status,pointCost:points,checkedInAt:status==="RESERVED"?new Date():null,card:{unit}});
const sessions:CourseAnalysisSession[]=[
 {id:"a",coachId:"coach",startsAt:new Date("2026-09-16T16:00:00Z"),endsAt:new Date("2026-09-16T17:00:00Z"),bookings:[booking("b","ATTENDED"),booking("c","CANCELLED")]},
 {id:"b",coachId:"coach",startsAt:new Date("2026-09-17T01:00:00Z"),endsAt:new Date("2026-09-17T02:00:00Z"),bookings:[booking("b","ATTENDED","SESSION",1),booking("d","RESERVED"),booking("e","NO_SHOW")]},
 {id:"previous",coachId:"coach",startsAt:new Date("2026-09-16T15:59:59Z"),endsAt:new Date("2026-09-16T16:59:59Z"),bookings:[booking("c","ATTENDED")]},
];
describe("course analysis real attendee and unit semantics",()=>{
 it("counts a shared-card attendee across classes as one visitor and two attendances",()=>{
  const result=summarizeCourseAttendance(sessions,new Map([["b",new Date("2026-09-16T16:00:00Z")]]),range);
  expect(result).toMatchObject({sessions:2,hours:2,participants:3,participations:4,completed:2,checkedIn:1,noShow:1,pointsUsed:3,sessionsUsed:1,visitors:["b"],newVisitors:["b"],returningVisitors:[]});
  expect(result.customers).toEqual([{id:"b",name:"b"}]);
 });
 it("uses earliest completed class, not profile creation or reservation operator, for new/returning",()=>{
  const result=summarizeCourseAttendance(sessions,new Map([["b",new Date("2026-08-01T01:00:00Z")]]),range);
  expect(result.newVisitors).toEqual([]);expect(result.returningVisitors).toEqual(["b"]);
 });
 it("does not pretend missing first attendance evidence is a returning customer",()=>{
  const result=summarizeCourseAttendance(sessions,new Map(),range);
  expect(result.unknownFirstVisits).toEqual(["b"]);expect(result.returningVisitors).toEqual([]);
 });
 it("compares an adjacent period of equal length across Taipei midnight",()=>{
  expect(previousCourseAnalysisRange(range)).toEqual({startDate:"2026-09-16",endDate:"2026-09-16"});
  expect(previousCourseAnalysisRange({startDate:"2026-03-01",endDate:"2026-03-03"})).toEqual({startDate:"2026-02-26",endDate:"2026-02-28"});
 });
 it("clamps leap-day prior-year comparisons and validates impossible dates",()=>{
  expect(courseAnalysisPriorYear({startDate:"2024-02-01",endDate:"2024-02-29"})).toEqual({startDate:"2023-02-01",endDate:"2023-02-28"});
  expect(()=>courseAnalysisRange({startDate:"2026-02-30",endDate:"2026-03-01"})).toThrow();
  expect(()=>courseAnalysisRange({startDate:"2026-09-18",endDate:"2026-09-17"})).toThrow();
  expect(courseAnalysisRange({month:"2026-02"})).toEqual({startDate:"2026-02-01",endDate:"2026-02-28"});
 });
});
