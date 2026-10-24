import {z} from 'zod';
const amount=z.number().int().min(0).max(10000000);
/** Optional pricing port for service-based catalogs; no implicit discount policy. */
export const savedCourseServicePrice=z.object({id:z.string().min(1),name:z.string(),revision:z.number().int().nonnegative(),price:amount,trialPrice:amount.nullable(),duration:z.number().int().min(5).max(720),trialDuration:z.number().int().min(5).max(720).nullable().default(null)});
export type CourseServicePrice=z.infer<typeof savedCourseServicePrice>;
export const courseServicePriceInput=savedCourseServicePrice.omit({name:true,duration:true}).extend({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid()});
