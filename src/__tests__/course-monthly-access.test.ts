import { expect, it } from "vitest";
import { canViewCourseMonthly } from "@/lib/course-monthly-access";
it("preserves owner access and only allows HQ in the verified music preview",()=>{
 expect(canViewCourseMonthly("OWNER",false)).toBe(true);
 expect(canViewCourseMonthly("OWNER",true)).toBe(true);
 expect(canViewCourseMonthly("ADMIN",true)).toBe(true);
 expect(canViewCourseMonthly("ADMIN",false)).toBe(false);
 for(const role of ["MANAGER","STAFF","CUSTOMER",""])for(const preview of [true,false])expect(canViewCourseMonthly(role,preview)).toBe(false);
});
