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

/** Purchase-time periods. New snapshots include gifts in period one; old snapshots stay untouched. */
export function musicCheckoutQuote(plan:Parameters<typeof musicPurchaseTerms>[0]&{validDays:number}, terms=plan.musicTerms??1, bonus=0, remaining?:number, validityDays?:number) {
  const base=musicPurchaseTerms(plan);
  const size=base.musicTermSizes[0];
  if(base.musicTermSizes.some(n=>n!==size)) throw new Error("方案每期堂數不同，請先建立單期收費方案");
  if(!Number.isInteger(terms)||terms<1||terms>100) throw new Error("購買期數須介於 1–100 期");
  if(remaining!==undefined && (terms!==1 || !Number.isInteger(remaining)||remaining<1||remaining>size)) throw new Error("插班限購本期剩餘堂數");
  const gifts=base.musicBonusLessons+bonus;
  if(!Number.isInteger(bonus)||bonus<0||gifts>1000) throw new Error("贈送堂數須介於 0–1000 堂");
  const lessons=(remaining??size)*terms;
  const price=Math.round(plan.price/(size*base.musicTermSizes.length)*lessons);
  const validDays=validityDays??plan.validDays/base.musicTermSizes.length*terms;
  if(!Number.isInteger(validDays)||validDays<1||validDays>3650||lessons+gifts>100000||price>10000000) throw new Error("購買堂數、金額或有效天數超過上限");
  const sizes=Array<number>(terms).fill(remaining??size); sizes[0]+=gifts;
  return {points:lessons+gifts,price,validDays,musicTermSizes:sizes,musicBonusLessons:gifts};
}

/** Legacy purchases stored a separate gift block; new purchases include gifts in the first period. */
export function musicSnapshotBonus(sizes:number[],bonus:number,total:number) {
  return sizes.reduce((sum,n)=>sum+n,0)===total ? 0 : bonus;
}
