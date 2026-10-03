import { expect,it } from "vitest";
import { courseSetupSteps,setupReminderVisible } from "@/lib/course-setup-progress";
const empty={coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0};
it("continues from actual incomplete store data and keeps room prerequisite visible",()=>{
 const steps=courseSetupSteps({...empty,coaches:1,templates:1});
 expect(steps.filter(s=>s.done)).toHaveLength(2);expect(steps.find(s=>!s.done)?.id).toBe("plan");expect(steps[3].href).toContain("view=rooms");
});
it("requires a usable teacher qualification before linking to scheduling",()=>{
 expect(courseSetupSteps({...empty,rooms:1})[3].href).toBe("/dashboard/teachers");
 expect(courseSetupSteps({...empty,rooms:1,qualifiedCoaches:1})[3].href).toBe("/dashboard/courses?action=schedule");
});
it("later applies to this login, never persists, and completed stores collapse",()=>{
 expect(setupReminderVisible("show",undefined,"a",false)).toBe(true);
 expect(setupReminderVisible("later","a","a",false)).toBe(false);
 expect(setupReminderVisible("later","a","b",false)).toBe(true);
 expect(setupReminderVisible("never","a","b",false)).toBe(false);
 expect(setupReminderVisible("show",undefined,"a",true)).toBe(false);
});
