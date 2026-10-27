import {z} from 'zod';
import type {Session} from '@/app/(dashboard)/dashboard/courses/workspace';
const session=z.object({
 id:z.string().min(1),templateId:z.string(),nameSnapshot:z.string(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),
 coachId:z.string(),roomId:z.string(),capacity:z.number().int(),pointCost:z.number(),
 isTrial:z.boolean().optional(),isFixed:z.boolean().optional(),isBiweekly:z.boolean().optional(),requestKey:z.string().optional(),bookingAudience:z.string().optional(),
 bookings:z.array(z.object({id:z.string(),customerId:z.string().nullable(),customerName:z.string(),status:z.string(),bookingKind:z.string(),checkedInAt:z.string().nullable().optional()})),
});
/** Only show confirmed, complete server rows; otherwise keep the normal read. */
export function sportsScheduleReceipt(value:unknown,enrollment:string):Session[]|undefined{
 const parsed=z.object({sessions:z.array(session).min(1)}).safeParse(value);
 return parsed.success?parsed.data.sessions.map(row=>({...row,sportsPalette:true,sportsEnrollment:enrollment})):undefined;
}
