import {expect,it} from "vitest";
import {courseCardScheduleIssue} from "@/lib/course-card-schedule-issue";
const card={unit:"SESSION",available:2,expiresAt:"2026-11-05T15:59:59.999Z"};
it("honors the exact expiry boundary",()=>{
 expect(courseCardScheduleIssue(card,new Date(card.expiresAt),1)).toBeNull();
 expect(courseCardScheduleIssue(card,new Date("2026-11-05T16:00:00Z"),1)?.message).toContain("2026-11-05");
});
it("requires the combined demand, including point-based cards",()=>{
 expect(courseCardScheduleIssue(card,null,3)?.message).toContain("可用 2 堂，本次需 3 堂");
 expect(courseCardScheduleIssue({...card,unit:"POINT"},null,3)?.message).toContain("可用 2 點，本次需 3 點");
});
it("keeps current expiry and source verification guards",()=>{
 expect(courseCardScheduleIssue({...card,expired:true},new Date("2026-10-01"),1)?.label).toBe("已過期");
 expect(courseCardScheduleIssue({...card,unavailableReason:"來源待核對"},null,1)?.message).toBe("來源待核對");
});
