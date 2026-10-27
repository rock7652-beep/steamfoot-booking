import {expect,it} from "vitest";
import {canViewCourseMonthly,canOperateCourseMonthly} from "@/lib/course-monthly-access";
it("permits HQ and owners across course modules, independently of native music rollout",()=>{
 for(const role of ["ADMIN","OWNER","MANAGER","STAFF","CUSTOMER",""]) {
  expect(canViewCourseMonthly(role)).toBe(role==="ADMIN"||role==="OWNER");
  expect(canOperateCourseMonthly(role)).toBe(role==="ADMIN"||role==="OWNER");
 }
});
