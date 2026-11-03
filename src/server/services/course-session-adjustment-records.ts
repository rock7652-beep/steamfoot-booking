import 'server-only';
import type {Prisma} from '../../../generated/course-client';
import type {SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';

/** Only called with cards already authorized by the caller. IDs join the
 * immutable receipt to its actual point entry; no calendar booking is invented. */
export async function courseSessionAdjustmentRecords(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,cardIds:string[]) {
  if (!cardIds.length) return [] as SessionAdjustmentRecord[];
  const rows = await tx.$queryRaw<Array<{afterJson:{record:SessionAdjustmentRecord}}>>`
    SELECT "afterJson" FROM "AuditLog"
    WHERE "storeId"=${storeId} AND "targetType"='CoursePointCard'
      AND "targetId"=ANY(${cardIds}::text[]) AND action='PLAN_SESSION_ADJUSTMENT'
    ORDER BY "createdAt" DESC,id DESC`;
  return rows.map(r=>r.afterJson.record);
}
