import {z} from 'zod';
import {serviceInput,planInput,key} from './contracts';
import type {Plan} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
export const savedBeautyLocation=z.object({capacity:z.number().nullable().optional(),rentalEnabled:z.boolean().optional(),rentalHourlyRate:z.number().optional(),rentalBufferMinutes:z.number().optional(),id:key,name:z.string(),isActive:z.boolean(),category:z.string(),details:z.string(),equipment:z.string(),location:z.string()});
export const savedBeautyService=serviceInput.extend({id:key,revision:z.number().int()});
export const savedBeautyPlan=planInput.extend({id:key,revision:z.number().int()});
export type ServiceProduct=z.infer<typeof savedBeautyService>;
export type SessionProduct=z.infer<typeof savedBeautyPlan>;
export function beautySessionProduct(row:SessionProduct):Plan{return {id:'plan:'+row.id,name:row.name,points:row.sessions,price:row.price,validDays:row.validDays,isActive:row.active,customerPurchasable:row.customerPurchasable,allowShared:row.allowShared,unit:'SESSION',templateIds:row.serviceIds,catalogRevision:row.revision,catalogSnapshot:{...row},lowBalanceEnabled:row.lowBalanceEnabled,lowBalanceThreshold:row.lowBalanceThreshold};}
