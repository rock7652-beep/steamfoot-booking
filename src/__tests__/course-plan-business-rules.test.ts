import { expect, it } from "vitest";
import { assertCoursePlanBusiness, quoteMusicPlanSettings } from "@/server/services/course-plan-rules";

const plan = {unit:"SESSION",musicTerms:3,musicBonusLessons:1,musicTermSizes:[]};
const template = {musicPricePerLesson:800,musicTermLessons:4,musicValidityDaysPerTerm:35};

it("derives music price and validity from paid periods while gifts add only quota", () => {
  expect(quoteMusicPlanSettings(plan,template)).toEqual({points:13,price:9600,validDays:105,musicTermSizes:[4,4,4]});
});
it("rejects incomplete pricing and quota overflow before a plan can be saved", () => {
  expect(() => quoteMusicPlanSettings(plan,{...template,musicPricePerLesson:null})).toThrow("請先完成");
  expect(() => quoteMusicPlanSettings({...plan,musicTerms:100,musicBonusLessons:1},{musicTermLessons:1000,musicPricePerLesson:1,musicValidityDaysPerTerm:1})).toThrow("總堂數超過上限");
});
it("allows sports session plans but rejects music period metadata and inline music setup", () => {
  const fitness = {...plan,musicTerms:null,musicBonusLessons:0};
  expect(() => assertCoursePlanBusiness(false,fitness,false)).not.toThrow();
  expect(() => assertCoursePlanBusiness(false,fitness,true)).toThrow("運動方案");
  expect(() => assertCoursePlanBusiness(false,plan,false)).toThrow("運動方案");
  expect(() => assertCoursePlanBusiness(true,{...plan,unit:"POINT"},false)).toThrow("以堂數計算");
});
