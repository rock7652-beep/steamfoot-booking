import {expect,it} from "vitest";
import {courseDisplayText} from "@/lib/course-display-text";
import {courseSetupSteps} from "@/lib/course-setup-progress";
import {findCoursePortalGuides} from "@/lib/course-portal-guides";
import {availableGuides,operationGuides} from "@/lib/operation-guide";
it("music uses teachers while fitness keeps coaches, including compound titles",()=>{
 for(const label of ["教練管理","教練／老師 LINE 綁定","授課教練尚未設定","教練／教師"]){
  expect(courseDisplayText(label,true)).not.toContain("教練");
  expect(courseDisplayText(label,"MUSIC")).toContain("教師");
  expect(courseDisplayText(label,false)).toBe(label);
  expect(courseDisplayText(label,"FITNESS")).toBe(label);
 }
});
it("music setup labels, hints and both portal roles never show coaches",()=>{
 const setup=courseSetupSteps({coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0},true);
 expect(JSON.stringify(setup)).not.toContain("教練");
 for(const role of ["member","coach"] as const){
 const guides=findCoursePortalGuides(role,true,"",false,"ENABLED",true);
 expect(guides.length).toBeGreaterThan(0);
 expect(JSON.stringify(guides)).not.toContain("教練");
 expect(findCoursePortalGuides(role,true,"教師",false,"ENABLED",true).length).toBeGreaterThan(0);
 }
});
it("translates authorized guides before search without mutating catalog or metadata",()=>{
 const original=JSON.stringify(operationGuides);
 const permissions=[...new Set(operationGuides.flatMap(g=>[g.permission,...(g.additionalPermissions??[])]))];
 const features=Object.fromEntries(operationGuides.filter(g=>g.feature).map(g=>[g.feature!,true]));
 const guides=availableGuides({module:"course",music:true,permissions,features});
 expect(guides.length).toBeGreaterThan(0);
 for(const g of guides){
 expect([g.title,g.summary,g.answer,g.path,g.keywords,g.important,g.success,...g.steps,...g.details].join(" ")).not.toContain("教練");
 const base=operationGuides.find(v=>v.id===g.id)!;
 expect(g.sources).toEqual(base.sources);expect(g.permission).toBe(base.permission);
 }
 expect(JSON.stringify(operationGuides)).toBe(original);
 expect(availableGuides({module:"course",permissions,features}).some(g=>g.title.includes("教練"))).toBe(true);
});
