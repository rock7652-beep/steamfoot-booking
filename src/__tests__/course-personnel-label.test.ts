import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {coursePersonnelText} from "@/lib/course-personnel-label";
import {CoursePersonnelLabelProvider,useCoursePersonnelText} from "@/components/course-personnel-label";
import {courseSettingsSectionSchema,courseSettingsSectionRevision} from "@/lib/course-settings-sections";
function Sample({name,note}:{name:string;note:string}) {const t=useCoursePersonnelText();return createElement("div",null,createElement("h2",null,t("教練管理")),createElement("p",null,t("教師請假")),createElement("span",null,name),createElement("span",null,note));}
describe("store personnel terminology",()=>{
 it.each(["老師","教練"] as const)("normalizes authored labels to %s",label=>{
  expect(coursePersonnelText("教師管理／教練管理",label)).toBe(`${label}管理／${label}管理`);
  expect(coursePersonnelText("授課教師、教練／老師 LINE 綁定",label)).toBe(`授課${label}、${label} LINE 綁定`);
 });
 it("keeps module defaults unless a store explicitly chooses",()=>expect(coursePersonnelText("教師管理",null)).toBe("教師管理"));
 it("scopes output to each provider and preserves personal names and notes",()=>{
  const render=(label:"老師"|"教練")=>renderToStaticMarkup(createElement(CoursePersonnelLabelProvider,{storeId:label,label},createElement(Sample,{name:"陳教練",note:"王老師介紹"})));
  expect(render("老師")).toContain("<h2>老師管理</h2><p>老師請假</p><span>陳教練</span><span>王老師介紹</span>");
  expect(render("教練")).toContain("<h2>教練管理</h2><p>教練請假</p>");
 });
 it("validates choices and keeps a distinct revision for concurrency checks",()=>{
  expect(courseSettingsSectionSchema.safeParse({section:"personnel",personnelLabel:"店長"}).success).toBe(false);
  expect(courseSettingsSectionRevision({section:"personnel",personnelLabel:null})).not.toBe(courseSettingsSectionRevision({section:"personnel",personnelLabel:"老師"}));
 });
});
