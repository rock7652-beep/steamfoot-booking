import {z} from "zod";
export const selfBookingReceipt=z.object({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid(),expectedRevision:z.number().int().min(0)});
export const selfBookingSaveInput=z.object({enabled:z.boolean()}).merge(selfBookingReceipt);
export const savedSelfBooking=z.object({enabled:z.boolean(),revision:z.number().int().min(0)});
