import { expect,it } from "vitest";
import { courseSetupSteps,setupReminderVisible,courseSetupHref,currentCourseSetupStep } from "@/lib/course-setup-progress";
const empty={coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0,openDays:0};
it("guides store hours before resources, products, teaching qualifications and scheduling",()=>{
 expect(courseSetupSteps(empty).map(s=>s.id)).toEqual(["hours","room","course","plan","coach","schedule"]);
 const steps=courseSetupSteps({...empty,openDays:1,rooms:1,templates:1,plans:1,coaches:1},true);
 expect(steps.find(s=>!s.done)?.id).toBe("coach");
 expect(steps.find(s=>s.id==="coach")?.label).toBe("補齊教師授課資格");
});
it("does not mark a store ready merely because resources and an old session exist",()=>{
 const counts={...empty,templates:1,coaches:1,qualifiedCoaches:1,plans:1,rooms:1,sessions:1};
 expect(courseSetupSteps(counts).find(s=>!s.done)?.id).toBe("hours");
 expect(courseSetupSteps({...counts,openDays:1}).every(s=>s.done)).toBe(true);
});
it("advances music teaching subjects to plans before a plan generates its class template",()=>{
 const counts={...empty,openDays:6,rooms:1,subjects:1};
 expect(courseSetupSteps(counts,true).find(s=>!s.done)?.id).toBe("plan");
 expect(courseSetupSteps({...counts,subjects:0,templates:1},true).find(s=>!s.done)?.id).toBe("course");
 expect(courseSetupSteps({...counts,subjects:1},false).find(s=>!s.done)?.id).toBe("course");
});
it("keeps existing completion counts while changing presentation order",()=>{
 const steps=courseSetupSteps({...empty,openDays:1,templates:1,coaches:1,qualifiedCoaches:1,plans:1});
 expect(steps.find(s=>!s.done)?.id).toBe("room");
 expect(courseSetupSteps({...empty,openDays:1,templates:1,coaches:1,qualifiedCoaches:1,plans:1,rooms:1}).find(s=>!s.done)?.href).toBe("/dashboard/courses?action=schedule");
});
it("explains conditional duty coverage without imposing it on stores that disabled linkage",()=>{
 expect(courseSetupSteps({...empty,dutyEnabled:true},true).find(s=>s.id==="coach")?.hint).toContain("涵蓋整堂課");
 expect(courseSetupSteps(empty,true).find(s=>s.id==="coach")?.hint).not.toContain("已啟用值班聯動");
});
it("later applies to this login, never persists, and completed stores collapse",()=>{
 expect(setupReminderVisible("show",undefined,"a",false)).toBe(true);
 expect(setupReminderVisible("later","a","a",false)).toBe(false);
 expect(setupReminderVisible("later","a","b",false)).toBe(true);
 expect(setupReminderVisible("never","a","b",false)).toBe(false);
 expect(setupReminderVisible("show",undefined,"a",true)).toBe(false);
});

it("repairs existing inactive resources without opening duplicate-create forms",()=>{
 const steps=courseSetupSteps({...empty,existing:{rooms:1,courses:1,plans:1,coaches:1,hours:7}},true);
 for(const id of ["hours","room","course","plan","coach"]){const step=steps.find(s=>s.id===id)!;expect(step.status).toBe("repair");expect(step.href).not.toContain("action=");}
 expect(steps.find(s=>s.id==="room")?.label).toBe("啟用上課空間");
 expect(courseSetupSteps(empty,true).find(s=>s.id==="room")?.status).toBe("missing");
});

it("tracks only matching guide routes and drops setup markers from completed view links",()=>{
 const steps=courseSetupSteps(empty,true),room=steps[1];
 expect(courseSetupHref(room)).toBe("/dashboard/courses?view=rooms&action=create&setupStep=room");
 expect(currentCourseSetupStep(steps,"/hq/dashboard/courses","?view=rooms&setupStep=room")).toBe(1);
 expect(currentCourseSetupStep(steps,"/s/music/admin/dashboard/courses","?view=catalog&setupStep=room")).toBe(-1);
 expect(currentCourseSetupStep(steps,"/hq/dashboard/teachers","?setupStep=room")).toBe(-1);
 expect(currentCourseSetupStep(steps,"/hq/dashboard/courses","?view=rooms&setupStep=unknown")).toBe(-1);
 expect(courseSetupHref(courseSetupSteps({...empty,rooms:1},true)[1])).not.toContain("setupStep=");
});
