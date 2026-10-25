import {z} from 'zod';
import {dayRange,toLocalDateStr,addTaiwanDuration} from '@/lib/date-utils';
export const beautyCardMaintenanceInput=z.object({
 expectedStoreId:z.string().min(1),cardId:z.string().min(1),requestKey:z.string().uuid(),
 action:z.enum(['close','expiry']),expiresDate:z.string().optional(),reason:z.string().trim().min(1,'請填寫調整原因').max(500),
 expectedRemaining:z.number().int().nonnegative(),expectedExpiresAt:z.string().datetime(),
}).strict();
export type BeautyCardMaintenanceInput=z.infer<typeof beautyCardMaintenanceInput>;
export function maintenanceExpiry(date:string){
 const range=dayRange(date);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(+range.end)||toLocalDateStr(range.start)!==date||date<toLocalDateStr()||date>addTaiwanDuration(toLocalDateStr(),3650,'DAY'))throw Error('請選擇今天起十年內的有效到期日');
 return range.end;
}
export function assertCardMaintenanceReservations(action:'close'|'expiry',expiresAt:Date,reservations:{startsAt:Date}[]){
 if(action==='close'&&reservations.length)throw Error('此方案仍有待服務預約，請先取消或更換使用方案後再註銷');
 if(reservations.some(row=>row.startsAt>=expiresAt))throw Error('新期限早於既有預約，請先處理受影響的預約');
}
