import {expect,it} from "vitest";
import {courseEnrollmentMode,courseHasSeatLimit} from "@/lib/course-capacity";
it("honors the sports assigned rule over the legacy OPEN default",()=>{
 expect(courseEnrollmentMode({enrollmentMode:"OPEN"},"ASSIGNED")).toBe("ASSIGNED");
 expect(courseHasSeatLimit({enrollmentMode:"OPEN"},"ASSIGNED")).toBe(false);
});
it("keeps a mixed OPEN class limited even when legacy fields say assigned",()=>{
 expect(courseHasSeatLimit({enrollmentMode:"ASSIGNED",bookingAudience:"ASSIGNED"},"OPEN")).toBe(true);
});
it("supports music assigned metadata and limits missing or unknown modes",()=>{
 expect(courseHasSeatLimit({enrollmentMode:"ASSIGNED"})).toBe(false);
 expect(courseHasSeatLimit({enrollmentMode:"OPEN",bookingAudience:"ASSIGNED"})).toBe(false);
 expect(courseHasSeatLimit({})).toBe(true);
 expect(courseHasSeatLimit({enrollmentMode:"INVALID"})).toBe(true);
 expect(courseHasSeatLimit({enrollmentMode:"ASSIGNED"},"INVALID")).toBe(true);
});
