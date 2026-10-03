import {describe,expect,it} from "vitest";
import {musicCheckoutQuote,musicSnapshotBonus,musicPlanQuote,musicCourseExpiry,musicPurchaseTerms,musicProratedTerms,musicPeriodAt} from "@/lib/music-course-products";
import {courseTemplateInput} from "@/lib/course-scheduling";
import {courseTeacherFee} from "@/lib/course-fee-payment";

describe("music course terms",()=>{
  it.each([1,3,6,7,18,1000])("supports freely configured %i lesson terms", lessons=>{
    expect(courseTemplateInput.shape.musicTermLessons.parse(lessons)).toBe(lessons);
    expect(musicPlanQuote({musicPricePerLesson:450,musicTermLessons:lessons,musicValidityDaysPerTerm:70},1))
      .toEqual({lessons,price:450*lessons,validDays:70});
  });
  it.each([0,-1,1.5,1001])("rejects invalid lesson count %i", lessons=>{
    expect(courseTemplateInput.shape.musicTermLessons.safeParse(lessons).success).toBe(false);
  });
  it("prices any whole number of four-lesson periods and multiplies validity",()=>{
    expect(musicPlanQuote({musicPricePerLesson:800,musicTermLessons:4,musicValidityDaysPerTerm:70},4))
      .toEqual({lessons:16,price:12800,validDays:280});
  });
  it("prices eight-lesson group periods",()=>{
    expect(musicPlanQuote({musicPricePerLesson:450,musicTermLessons:8,musicValidityDaysPerTerm:70},2))
      .toEqual({lessons:16,price:7200,validDays:140});
  });
  it("rejects missing course pricing and terms over plan limits",()=>{
    expect(()=>musicPlanQuote({musicPricePerLesson:null,musicTermLessons:4,musicValidityDaysPerTerm:35},1)).toThrow();
    expect(()=>musicPlanQuote({musicPricePerLesson:800,musicTermLessons:4,musicValidityDaysPerTerm:70},100)).toThrow();
  });
  it("starts validity on the first lesson's Taiwan calendar day",()=>{
    expect(musicCourseExpiry(new Date("2026-09-30T18:00:00Z"),35).toISOString())
      .toBe("2026-11-04T15:59:59.999Z");
  });
});

describe("music teacher payout",()=>{
  const sixty={mode:"SHARE",value:60};
  it("counts two enrolled seats including one no-show once per class",()=>{
    expect(courseTeacherFee(sixty,{paid:2,freeTrial:0,pending:0},{perLesson:325,freeTrialBase:null})).toBe(390);
  });
  it("uses each free-trial seat basis and defers pending attendance",()=>{
    expect(courseTeacherFee(sixty,{paid:0,freeTrial:2,pending:0},{perLesson:650,freeTrialBase:325})).toBe(390);
    expect(courseTeacherFee(sixty,{paid:0,freeTrial:2,pending:1},{perLesson:650,freeTrialBase:325})).toBeNull();
  });
  it("keeps fixed pay independent of headcount",()=>{
    expect(courseTeacherFee({mode:"CLASS",value:500},{paid:0,freeTrial:0,pending:0},{perLesson:null,freeTrialBase:null})).toBe(500);
  });
});

describe("immutable purchases and midterm joins",()=>{
 const plan={points:13,price:9600,musicTerms:3,musicTermSizes:[4,4,4],musicBonusLessons:1};
 it("keeps paid periods and both bonus sources separate",()=>{
  expect(musicPurchaseTerms(plan,2)).toEqual({points:15,price:9600,musicTermSizes:[4,4,4],musicBonusLessons:3});
  expect(musicPeriodAt([4,4,4],3,12)).toEqual({number:4,index:1,count:3,start:12,bonus:true});
  expect(musicPeriodAt([4,4,4],3,15)).toBeNull();
 });
 it.each([[6,2700],[7,3150]])("prices %i remaining group lessons",(remaining,price)=>{
  expect(musicProratedTerms({points:8,price:3600,musicTerms:1,musicTermSizes:[8]},remaining)).toEqual({points:remaining,price,musicTermSizes:[remaining],musicBonusLessons:0});
 });
 it("rejects ambiguous periods, excess bonus and invalid joining counts",()=>{
  expect(()=>musicPurchaseTerms({...plan,musicTermSizes:[8]},0)).toThrow();
  expect(()=>musicPurchaseTerms(plan,1000)).toThrow();
  expect(()=>musicProratedTerms(plan,3)).toThrow();
  expect(()=>musicProratedTerms({points:8,price:3600,musicTerms:1},9)).toThrow();
 });
});

describe("purchase-time music periods",()=>{
 const plan={points:4,price:3200,validDays:35,musicTerms:1,musicTermSizes:[4],musicBonusLessons:0};
 it("quotes six periods without making six catalog products",()=>{
  expect(musicCheckoutQuote(plan,6)).toEqual({points:24,price:19200,validDays:210,musicTermSizes:[4,4,4,4,4,4],musicBonusLessons:0});
  expect(musicCheckoutQuote({...plan,validDays:30},6).validDays).toBe(180);
 });
 it("places bonus lessons in the first period and keeps boundaries accurate",()=>{
  const q=musicCheckoutQuote(plan,3,1);expect(q.musicTermSizes).toEqual([5,4,4]);expect(q.validDays).toBe(105);expect(q.price).toBe(9600);
  const bonus=musicSnapshotBonus(q.musicTermSizes,q.musicBonusLessons,q.points);
  expect(musicPeriodAt(q.musicTermSizes,bonus,4)).toMatchObject({number:1,index:5,count:5});
  expect(musicPeriodAt(q.musicTermSizes,bonus,5)).toMatchObject({number:2,index:1,count:4});
  expect(musicPeriodAt(q.musicTermSizes,bonus,12)).toMatchObject({number:3,index:4,count:4});
  expect(musicPeriodAt(q.musicTermSizes,bonus,13)).toBeNull();
  expect(musicSnapshotBonus([4,4,4],1,13)).toBe(1);
 });
 it("supports a purchase-specific validity without changing the product",()=>{
  expect(musicCheckoutQuote(plan,3,1,undefined,120).validDays).toBe(120);expect(plan.validDays).toBe(35);
 });
 it.each([0,-1,1.5,101,NaN])("rejects invalid terms %s",n=>expect(()=>musicCheckoutQuote(plan,n)).toThrow());
 it("rejects multi-period midterm joins and gifts over the cap",()=>{
  expect(()=>musicCheckoutQuote(plan,2,0,3)).toThrow();expect(()=>musicCheckoutQuote(plan,1,1001)).toThrow();
 });
});
