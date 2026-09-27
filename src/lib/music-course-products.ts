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
