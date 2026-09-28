import {addTaiwanDuration,dayRange,toLocalDateStr} from "@/lib/date-utils";

export function musicPlanQuote(course:{musicPricePerLesson:number|null;musicTermLessons:number|null;musicValidityDaysPerTerm:number|null},terms:number) {
  if (!Number.isInteger(terms) || terms < 1 || terms > 100 ||
      course.musicPricePerLesson === null || course.musicTermLessons === null || course.musicValidityDaysPerTerm === null)
    throw new Error("請先完成課程售價、每期堂數及效期，再選擇購買期數");
  const lessons=course.musicTermLessons*terms;
  const price=course.musicPricePerLesson*lessons;
  const validDays=course.musicValidityDaysPerTerm*terms;
  if (lessons>100000 || price>10000000 || validDays>3650) throw new Error("購買期數超過方案上限");
  return {lessons,price,validDays};
}

export function musicCourseExpiry(firstLesson:Date,validDays:number) {
  if (!Number.isInteger(validDays)||validDays<1||validDays>3650) throw new Error("方案有效天數不正確");
  return dayRange(addTaiwanDuration(toLocalDateStr(firstLesson),validDays-1,"DAY")).end;
}

/** Immutable paid periods; bonus lessons form a separate block with the same expiry. */
export function musicPurchaseTerms(plan:{points:number;price:number;musicTerms?:number|null;musicTermSizes?:number[];musicBonusLessons?:number}, manualBonus=0) {
  const bonus=plan.musicBonusLessons??0;
  const paid=plan.points-bonus;
  const sizes=plan.musicTermSizes?.length ? [...plan.musicTermSizes] : plan.musicTerms && paid % plan.musicTerms===0 ? Array(plan.musicTerms).fill(paid/plan.musicTerms) as number[] : [];
  if (!Number.isInteger(manualBonus)||manualBonus<0||manualBonus>1000||bonus+manualBonus>1000||paid+bonus+manualBonus>100000||!sizes.length||sizes.some(n=>!Number.isInteger(n)||n<1)||sizes.reduce((a,b)=>a+b,0)!==paid) throw new Error("方案期別資料不完整，請先核對收費方案");
  return {musicTermSizes:sizes,musicBonusLessons:bonus+manualBonus,points:paid+bonus+manualBonus,price:plan.price};
}
export function musicPeriodAt(sizes:number[],bonus:number,position:number) {
  let start=0;
  for(const [index,count] of [...sizes,...(bonus?[bonus]:[])].entries()) {
    if(position>=start && position<start+count)return {number:index+1,index:position-start+1,count,start,bonus:index===sizes.length};
    start+=count;
  }
  return null;
}
export function musicProratedTerms(plan:Parameters<typeof musicPurchaseTerms>[0],remaining:number,manualBonus=0) {
  const quote=musicPurchaseTerms(plan,manualBonus);
  if(quote.musicTermSizes.length!==1||!Number.isInteger(remaining)||remaining<1||remaining>quote.musicTermSizes[0])throw new Error("插班請選單期方案，堂數須在本期範圍內");
  return {...quote,musicTermSizes:[remaining],points:remaining+quote.musicBonusLessons,price:Math.round(plan.price/quote.musicTermSizes[0]*remaining)};
}
