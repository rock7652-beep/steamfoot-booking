import {describe,expect,it,vi} from "vitest";
import {createElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {coursePersonnelText} from "@/lib/course-personnel-label";
import {CoursePersonnelLabelProvider,useCoursePersonnelText} from "@/components/course-personnel-label";
import {courseSettingsSectionSchema,courseSettingsSectionRevision} from "@/lib/course-settings-sections";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({href,children}:{href:string;children:ReactNode})=>createElement("a",{href},children)}));
import {ReminderTabs} from "@/app/(dashboard)/dashboard/reminders/reminder-tabs";
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

describe("reminder recipient tab terminology",()=>{
 it.each([
  {music:false,label:null,expected:"教練通知"},
  {music:true,label:null,expected:"老師通知"},
  {music:false,label:"老師" as const,expected:"老師通知"},
  {music:true,label:"教練" as const,expected:"教練通知"},
 ])("uses $expected for music=$music, store label=$label without changing the tab key",({music,label,expected})=>{
  const html=renderToStaticMarkup(createElement(CoursePersonnelLabelProvider,{storeId:"store-a",label},createElement(ReminderTabs,{active:"coach",explicit:true,storeId:"store-a",baseHref:"/dashboard/courses/reminders",coach:true,music})));
  expect(html).toContain(`href="/dashboard/courses/reminders?tab=coach">${expected}</a>`);
  expect(html).not.toContain("工作人員通知");
 });
 it("keeps technicians distinct from the course-store terminology",()=>{
  const html=renderToStaticMarkup(createElement(CoursePersonnelLabelProvider,{storeId:"store-b",label:"老師"},createElement(ReminderTabs,{active:"technician",explicit:true,storeId:"store-b",baseHref:"/dashboard/beauty/reminders",beauty:true})));
  expect(html).toContain('href="/dashboard/beauty/reminders?tab=technician">技師通知</a>');expect(html).not.toContain("老師通知");
 });
 it("does not add a personnel tab to stores without one",()=>{
  const html=renderToStaticMarkup(createElement(ReminderTabs,{active:"customer",explicit:true,storeId:"steam"}));expect(html).not.toContain("tab=coach");expect(html).not.toContain("tab=technician");
 });
});
