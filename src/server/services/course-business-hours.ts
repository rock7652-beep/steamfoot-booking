import { parseBusinessPeriods } from "@/lib/business-hours-resolver";
import { toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
const names = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
type Hour = { dayOfWeek:number; isOpen:boolean; openTime:string|null; closeTime:string|null; segments:unknown; slotInterval:number; defaultCapacity:number };
type Special = { date:Date; type:string; reason:string|null; openTime:string|null; closeTime:string|null; segments:unknown; slotInterval:number|null; defaultCapacity:number|null };
export function resolvedCourseHours(date:string, hours:Hour[], specials:Special[]) {
  const special = specials.find(s=>s.date.toISOString().slice(0,10)===date);
  const dayOfWeek = new Date(date+"T00:00:00Z").getUTCDay();
  const weekly = hours.find(h=>h.dayOfWeek===dayOfWeek);
  const status: "open"|"closed"|"training"|"custom" = special ? special.type as "closed"|"training"|"custom" : weekly?.isOpen===false ? "closed" : "open";
  const row = special?.type==="custom" ? special : weekly;
  const periods = row && status!=="closed" && status!=="training" ? parseBusinessPeriods(row.segments, {...row, slotInterval:row.slotInterval??60,defaultCapacity:row.defaultCapacity??6}) : [];
  return { status, periods, openTime:row?.openTime??null,closeTime:row?.closeTime??null,dayOfWeek,dayName:names[dayOfWeek],reason:special?.reason??null };
}
export async function assertCourseSessionsFitHours(tx:Prisma.TransactionClient,storeId:string,sessions:{startsAt:Date;endsAt:Date}[]) {
 const hours=await tx.$queryRaw<Hour[]>`SELECT * FROM "BusinessHours" WHERE "storeId"=${storeId}`;
 const specials=await tx.$queryRaw<Special[]>`SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`;
 for(const s of sessions) {
  const date=toLocalDateStr(s.startsAt),value=resolvedCourseHours(date,hours,specials);
  if(value.status==="closed"||value.status==="training"||(value.periods.length&&!value.periods.some(p=>date===toLocalDateStr(s.endsAt)&&p.openTime<=formatTWDateTime(s.startsAt).slice(11)&&p.closeTime>=formatTWDateTime(s.endsAt).slice(11))))
   throw new AppError("VALIDATION",`${date} ${formatTWDateTime(s.startsAt).slice(11)} 課程與營業／公休設定衝突，本批尚未儲存`);
 }
}
