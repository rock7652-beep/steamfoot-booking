import {z} from 'zod';

export const walletSessionCorrectionInput=z.object({
  expectedStoreId:z.string().min(1),customerId:z.string().min(1),walletId:z.string().min(1),
  sessionId:z.string().min(1),expectedStatus:z.enum(['BACKFILLED','VOIDED']),
  expectedUpdatedAt:z.string().datetime(),requestKey:z.string().uuid(),
  reason:z.string().trim().min(1,'請填寫更正原因').max(200),
});
export type WalletSessionCorrectionInput=z.infer<typeof walletSessionCorrectionInput>;
export type WalletSessionCorrectionRecord={
  id:string;sessionId:string;sessionNo:number;walletId:string;originalStatus:'BACKFILLED'|'VOIDED';
  originalDate:string|null;originalReason:string|null;originalOperatorStaffId:string|null;originalOperatorName:string|null;
  correctedAt:string;actorName:string;reason:string;remainingAfter:number;
};
export type WalletSessionCorrectionResult=
  |{success:true;data:WalletSessionCorrectionRecord;syncWarning?:boolean}
  |{success:false;error:string;uncertain?:boolean};
