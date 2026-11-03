import {z} from 'zod';

export const planManagementInput=z.object({
 expectedStoreId:z.string().min(1),requestKey:z.string().uuid(),cardId:z.string().min(1),
 operation:z.enum(['close','expiry']),expectedRemaining:z.number().int().nonnegative(),
 expectedExpiresAt:z.string().datetime().nullable(),reason:z.string().trim().min(1,'請填寫調整原因').max(500),
 expiresDate:z.string().optional(),
});
export type PlanManagementInput=z.infer<typeof planManagementInput>;
export type PlanManagementReceipt={id:string;remaining:number;expiresAt:string|null;closed:boolean};
export type PlanManagementResult={success:true;data:PlanManagementReceipt;syncWarning?:boolean}|{success:false;error:string;uncertain?:boolean};
