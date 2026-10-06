import { expect,it } from "vitest";
import { courseSetupSteps,setupReminderVisible } from "@/lib/course-setup-progress";
const empty={coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0};
it("creates courses before coaches so qualifications can be configured in one visit",()=>{
 expect(courseSetupSteps(empty)[0].id).toBe("course");
 const steps=courseSetupSteps({...empty,templates:1,coaches:1});
 expect(steps.find(s=>!s.done)?.id).toBe("coach");
 expect(steps.find(s=>s.id==="coach")?.label).toBe("設定授課課程");
});
it("keeps rooms explicit and advances to scheduling only after prerequisites",()=>{
 const steps=courseSetupSteps({...empty,templates:1,coaches:1,qualifiedCoaches:1,plans:1});
 expect(steps.find(s=>!s.done)?.id).toBe("room");
 expect(courseSetupSteps({...empty,templates:1,coaches:1,qualifiedCoaches:1,plans:1,rooms:1}).find(s=>!s.done)?.href).toBe("/dashboard/courses?action=schedule");
});
it("later applies to this login, never persists, and completed stores collapse",()=>{
 expect(setupReminderVisible("show",undefined,"a",false)).toBe(true);
 expect(setupReminderVisible("later","a","a",false)).toBe(false);
 expect(setupReminderVisible("later","a","b",false)).toBe(true);
 expect(setupReminderVisible("never","a","b",false)).toBe(false);
 expect(setupReminderVisible("show",undefined,"a",true)).toBe(false);
});
