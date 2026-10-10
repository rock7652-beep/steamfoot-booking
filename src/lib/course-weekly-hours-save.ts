import {z} from "zod";
export const weeklyPeriod=z.object({openTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),closeTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)});
export const weeklyDay=z.object({dayOfWeek:z.number().int().min(0).max(6),isOpen:z.boolean(),periods:z.array(weeklyPeriod).max(8)});
export const weeklyState=weeklyDay.extend({persisted:z.boolean().default(true)});
export const weeklyReceipt=z.object({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid(),expected:z.array(weeklyState).min(1).max(7)});
export const weeklySaveInput=z.object({days:z.array(weeklyDay).min(1).max(7)}).merge(weeklyReceipt);
export const savedWeeklyHours=z.array(weeklyState.extend({dayName:z.string(),openTime:z.string().nullable(),closeTime:z.string().nullable()})).max(7);
export function weeklyRevision(value:unknown){const day=weeklyState.parse(value);return JSON.stringify({...day,periods:[...day.periods].sort((a,b)=>a.openTime.localeCompare(b.openTime))});}
