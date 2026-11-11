import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../../generated/course-client';
import {AppError} from '@/lib/errors';
import {dayRange} from '@/lib/date-utils';
import {activeSessionAdjustments,type BackfillDuplicateReview,type SessionAdjustmentInput,type SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
import type {PlanManagementActor} from './plan-management-command';

export class BackfillReviewRequired extends AppError {
  constructor(public readonly review:BackfillDuplicateReview){
    super('CONFLICT','當天已有扣堂紀錄，請先核對是否為同一堂課。');
  }
}

/** Run under the store transaction lock, after authorization and before any write.
 * A date identifies possible duplicates, never a unique lesson. Confirmation is
 * bound to the exact command and evidence, and does not grant any permission. */
export async function reviewCourseBackfill(tx:Prisma.TransactionClient,actor:PlanManagementActor,input:SessionAdjustmentInput,records:SessionAdjustmentRecord[]){
  if(input.operation!=='BACKFILL'||!input.occurredOn)return;
  const range=dayRange(input.occurredOn);
  const bookings=await tx.courseBooking.findMany({
    where:{storeId:actor.storeId,cardId:input.cardId,customerId:input.customerId,pointCost:{gt:0},
      OR:[{status:{in:['ATTENDED','NO_SHOW']}},{absenceKind:'GROUP_LEAVE_FORFEITED'}],
      session:{startsAt:{gte:range.start,lte:range.end}}},
    select:{id:true,pointCost:true,status:true,absenceKind:true},orderBy:{id:'asc'},
  });
  const manual=activeSessionAdjustments(records).filter(record=>record.cardId===input.cardId&&record.customerId===input.customerId&&record.operation==='BACKFILL'&&record.occurredOn===input.occurredOn).sort((a,b)=>a.id.localeCompare(b.id));
  if(!bookings.length&&!manual.length)return;
  const {duplicateAcknowledgement:ack,...command}=input;
  const token=createHash('sha256').update(JSON.stringify([actor.storeId,actor.userId,command,
    bookings.map(row=>[row.id,row.pointCost,row.status,row.absenceKind]),manual.map(row=>[row.id,row.quantity])])).digest('hex');
  const review={token,date:input.occurredOn,existingQuantity:bookings.reduce((sum,row)=>sum+row.pointCost,0)+manual.reduce((sum,row)=>sum+row.quantity,0)};
  if(ack!==token)throw new BackfillReviewRequired(review);
  return review;
}
