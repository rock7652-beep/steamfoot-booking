import {describe,expect,it} from "vitest";
import {musicPlanQuote,musicCourseExpiry} from "@/lib/music-course-products";
import {courseTeacherFee} from "@/lib/course-fee-payment";

describe("music course terms",()=>{
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
