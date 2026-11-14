import 'server-only';
import type {Prisma} from '../../../generated/course-client';

/** A leave consumes a slot only while its latest settlement still deducts.
 * Read the original booking ledger, not the makeup card: closing that separate
 * right must not erase a deduction from the original plan. Same-time conflicting
 * entries cannot prove a debit, so they are not presented as a used lesson.
 */
export async function readProgressDeductedLeaveIds(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,cardIds:string[]) {
 if(!cardIds.length)return [];
 const rows=await tx.$queryRaw<Array<{id:string}>>`
  SELECT b.id FROM "CourseBooking" b
  JOIN LATERAL (
   SELECT e.kind,e."createdAt" FROM "CoursePointEntry" e
   WHERE e."storeId"=b."storeId" AND e."cardId"=b."cardId" AND e."bookingId"=b.id
    AND (e.kind='DEBIT' OR e.kind LIKE 'DEBIT:%' OR e.kind='RELEASE' OR e.kind LIKE 'RELEASE:%' OR e.kind LIKE 'CORRECT:%')
   ORDER BY e."createdAt" DESC LIMIT 1
  ) latest ON true
  WHERE b."storeId"=${storeId} AND b."cardId"=ANY(${cardIds}::text[])
   AND b.status='CANCELLED' AND b."absenceKind"='STUDENT_LEAVE' AND b."pointCost">0
   AND (latest.kind='DEBIT' OR latest.kind LIKE 'DEBIT:%')
   AND NOT EXISTS (
    SELECT 1 FROM "CoursePointEntry" e
    WHERE e."storeId"=b."storeId" AND e."cardId"=b."cardId" AND e."bookingId"=b.id AND e."createdAt"=latest."createdAt"
     AND (e.kind='RELEASE' OR e.kind LIKE 'RELEASE:%' OR e.kind LIKE 'CORRECT:%')
   )`;
 return rows.map(row=>row.id);
}
