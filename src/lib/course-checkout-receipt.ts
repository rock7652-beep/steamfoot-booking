import {z} from 'zod';
export const courseCheckoutReceipt=z.object({purchaseId:z.string().min(1),cardId:z.string().nullable(),customerId:z.string().min(1),name:z.string(),quantity:z.number().int().nonnegative(),unit:z.enum(['POINT','SESSION']),paid:z.number().int().nonnegative()});
export type CourseCheckoutReceipt=z.infer<typeof courseCheckoutReceipt>;
