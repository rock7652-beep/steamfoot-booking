import { z } from 'zod';
import { parseTaipeiDateTime, toLocalDateStr } from './date-utils';

export const sessionAdjustmentInput = z.object({
  expectedStoreId: z.string().min(1), requestKey: z.string().uuid(), cardId: z.string().min(1),
  customerId: z.string().min(1), operation: z.enum(['BACKFILL', 'VOID', 'REVERSE']),
  quantity: z.number().int().min(1).max(1000), expectedRemaining: z.number().int().nonnegative(),
  expectedExpiresAt: z.string().datetime().nullable(), reason: z.string().trim().max(500).default(''),
  occurredOn: z.string().optional(), reversalOf: z.string().max(200).optional(),
}).superRefine((d, ctx) => {
  if (d.operation === 'BACKFILL' && (!d.occurredOn || !parseTaipeiDateTime(d.occurredOn, '00:00') || d.occurredOn > toLocalDateStr()))
    ctx.addIssue({code:'custom',path:['occurredOn'],message:'請填寫有效且不晚於今天的實際上課日期'});
  if (d.operation === 'REVERSE' && !d.reversalOf)
    ctx.addIssue({code:'custom',path:['reversalOf'],message:'請選擇要更正的原紀錄'});
});
export type SessionAdjustmentInput = z.infer<typeof sessionAdjustmentInput>;
export type SessionAdjustmentRecord = {
  id:string; cardId:string; customerId:string; customerName:string;
  operation:'BACKFILL'|'VOID'|'REVERSE'; quantity:number; occurredOn:string|null;
  reason:string; recordedAt:string; actorName:string; reversalOf:string|null;
  remainingBefore:number; remainingAfter:number;
  slots?:Array<{period:number;ordinal:number;bonus:boolean}>;
};
export type SessionAdjustmentResult = {success:true;data:{record:SessionAdjustmentRecord;remaining:number;expiresAt:string|null};syncWarning?:boolean}
  | {success:false;error:string;uncertain?:boolean};
export function activeSessionAdjustments(records:SessionAdjustmentRecord[]) {
  const reversed = new Set(records.flatMap(r => r.reversalOf ? [r.reversalOf] : []));
  return records.filter(r => r.operation !== 'REVERSE' && !reversed.has(r.id));
}
