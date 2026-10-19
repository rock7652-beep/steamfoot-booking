import {describe,it,expect} from "vitest";
import {sportsCalendarPresentation,sportsCalendarMatches,sportsScheduleKinds} from "@/lib/sports-calendar-presentation";
describe("運動原課表五種排課分類",()=>{
 it.each([
 [{isFixed:true},"WEEKLY"],
 [{isFixed:true,isBiweekly:true},"BIWEEKLY"],
 [{isFixed:false},"SINGLE"],
 [{isTrial:true,isFixed:true},"TRIAL"],
 [{previewKind:"RENTAL",isTrial:true},"RENTAL"],
 ] as const)("%j 使用 %s 的整張卡片底色",(row,kind)=>{
 const result=sportsCalendarPresentation(row);
 expect(result.kind).toBe(kind);expect(result.card).toMatch(/bg-(blue|violet|emerald|orange|pink)-100/);expect(result.card).not.toContain("bg-white");
 expect(sportsCalendarMatches(row,kind)).toBe(true);expect(sportsCalendarMatches(row,"all")).toBe(true);expect(sportsCalendarMatches(row,"GROUP")).toBe(false);
 });
 it("只提供固定每週、固定隔週、單次、體驗、空間出租",()=>{
 expect(sportsScheduleKinds.map(k=>k.label)).toEqual(["固定每週","固定隔週","單次","體驗","空間出租"]);
 expect(sportsCalendarPresentation({isBiweekly:true,isFixed:false}).kind).toBe("SINGLE");
 });
});
