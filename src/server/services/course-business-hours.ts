import { resolvedCourseHours, type Hour, type Special } from "@/lib/course-business-hours";
export { resolvedCourseHours } from "@/lib/course-business-hours";
import { toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
export async function assertCourseSessionsFitHours(tx:Prisma.TransactionClient,storeId:string,sessions:{startsAt:Date;endsAt:Date}[]) {
 const hours=await tx.$queryRaw<Hour[]>`SELECT * FROM "BusinessHours" WHERE "storeId"=${storeId}`;
 const specials=await tx.$queryRaw<Special[]>`SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`;
 for(const s of sessions) {
  const date=toLocalDateStr(s.startsAt),value=resolvedCourseHours(date,hours,specials);
  if(value.status==="closed"||value.status==="training"||(value.periods.length&&!value.periods.some(p=>date===toLocalDateStr(s.endsAt)&&p.openTime<=formatTWDateTime(s.startsAt).slice(11)&&p.closeTime>=formatTWDateTime(s.endsAt).slice(11))))
   throw new AppError("VALIDATION",`${date} ${formatTWDateTime(s.startsAt).slice(11)} 課程與營業／公休設定衝突，本批尚未儲存`);
 }
}
