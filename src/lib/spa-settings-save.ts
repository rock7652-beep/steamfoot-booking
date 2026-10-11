import { z } from "zod";

export const spaSaveReceipt = z.object({
  expectedStoreId: z.string().min(1).max(100), requestKey: z.string().uuid(),
  expectedRevision: z.string().max(30000).optional(),
});
export const spaLocationValues = z.object({
  id: z.string().min(1).max(100).optional(), name: z.string().trim().min(1).max(60),
  isActive: z.boolean(), treatmentIds: z.array(z.string().min(1).max(100)).max(200),
});
export const savedSpaLocation = spaLocationValues.extend({id:z.string().min(1), revision:z.string()});
export function spaLocationRevision(row:{name:string;isActive:boolean;treatmentIds:string[]}) {
  return JSON.stringify([row.name,row.isActive,[...new Set(row.treatmentIds)].sort()]);
}
export const spaServiceValues=z.object({
  id:z.string().min(1).max(100).optional(),baseName:z.string().trim().min(1).max(100),variantLabel:z.string().trim().max(100),
  price:z.number().int().min(0).max(1000000),serviceMinutes:z.number().int().min(1).max(1440),bufferMinutes:z.number().int().min(0).max(240),
  isActive:z.boolean(),publicVisible:z.boolean(),staffIds:z.array(z.string().min(1).max(100)).max(200),locationIds:z.array(z.string().min(1).max(100)).max(200),
});
export const savedSpaService=spaServiceValues.extend({id:z.string().min(1),name:z.string(),revision:z.string()});
export function spaServiceRevision(row:z.infer<typeof spaServiceValues>){
  return JSON.stringify([row.baseName,row.variantLabel,row.price,row.serviceMinutes,row.bufferMinutes,row.isActive,row.publicVisible,[...new Set(row.staffIds)].sort(),[...new Set(row.locationIds)].sort()]);
}
export const spaPackageValues=z.object({
  id:z.string().min(1).max(100).optional(),expectedUpdatedAt:z.string().datetime().optional(),treatmentId:z.string().min(1).max(100),
  name:z.string().trim().min(1).max(80),price:z.number().int().min(0).max(9999999),uses:z.number().int().min(1).max(999),
  validityDays:z.number().int().min(1).max(3650),isActive:z.boolean(),publicVisible:z.boolean().optional(),
});
export const savedSpaPackage=spaPackageValues.omit({expectedUpdatedAt:true}).extend({id:z.string().min(1),publicVisible:z.boolean(),updatedAt:z.string().datetime()});
export function spaPackageRevision(row:{updatedAt?:Date|string}){return row.updatedAt?new Date(row.updatedAt).toISOString():"";}
