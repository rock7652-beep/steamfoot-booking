import {z} from 'zod';
import {parseTaipeiDateTime} from '@/lib/date-utils';

/** The intent emitted by the existing sports scheduling form, not a new UI. */
export const beautyNativeScheduleInput=z.object({
 operation:z.literal('schedule'),
 payload:z.object({
  subject:z.string().min(1).max(100),
  kind:z.enum(['每週固定','隔週固定','單次','體驗','空間出租']),
  mode:z.enum(['指定學員','開放選課']),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration:z.number().int().min(5).max(480),count:z.literal(1),
  coach:z.string().max(100),coachId:z.string().max(100),room:z.string().min(1).max(100),
  capacity:z.number().int().min(1).max(50),students:z.array(z.string().min(1).max(100)).max(12),
  waitlistLimit:z.number().int().min(0).max(100),waitlistStopMinutes:z.number().int().nonnegative(),
  price:z.number().int().min(0).max(1000000),customer:z.string().max(100),phone:z.string().max(30),
  customerId:z.string().min(1).max(100).nullable(),requestKey:z.string().uuid(),
 }).refine(d=>!!parseTaipeiDateTime(d.date,d.time),'日期時間無效'),
 expectedServiceRevision:z.number().int().nonnegative(),
});
