import {z} from "zod";
export const waitlistValues=z.object({enabled:z.boolean(),defaultLimit:z.number().int().min(1).max(100),autoPromoteStopMinutes:z.number().int().min(0).max(10080)});
export const waitlistReceipt=z.object({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid(),expectedRevision:z.string().min(1).max(2000)});
export const waitlistSaveInput=waitlistValues.merge(waitlistReceipt);
export function waitlistRevision(value:unknown){return JSON.stringify(waitlistValues.parse(value));}
export type SavedWaitlistSettings=z.infer<typeof waitlistValues>;
