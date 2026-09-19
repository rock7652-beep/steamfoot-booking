import { parseBusinessPeriods } from "./business-hours-resolver";
const names = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
export type Hour = { dayOfWeek:number; isOpen:boolean; openTime:string|null; closeTime:string|null; segments:unknown; slotInterval:number; defaultCapacity:number };
export type Special = { date:Date; type:string; reason:string|null; openTime:string|null; closeTime:string|null; segments:unknown; slotInterval:number|null; defaultCapacity:number|null };
export function resolvedCourseHours(date:string, hours:Hour[], specials:Special[]) {
  const special = specials.find(s=>s.date.toISOString().slice(0,10)===date);
  const dayOfWeek = new Date(date+"T00:00:00Z").getUTCDay();
  const weekly = hours.find(h=>h.dayOfWeek===dayOfWeek);
  const status: "open"|"closed"|"training"|"custom" = special ? special.type as "closed"|"training"|"custom" : weekly?.isOpen===false ? "closed" : "open";
  const row = special?.type==="custom" ? special : weekly;
  const periods = row && status!=="closed" && status!=="training" ? parseBusinessPeriods(row.segments, {...row, slotInterval:row.slotInterval??60,defaultCapacity:row.defaultCapacity??6}) : [];
  return { status, periods, openTime:row?.openTime??null,closeTime:row?.closeTime??null,dayOfWeek,dayName:names[dayOfWeek],reason:special?.reason??null };
}
