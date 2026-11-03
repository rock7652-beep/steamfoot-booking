"use server";
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {bulkUpdateCustomerAssignmentSchema,updateCustomerAssignmentSchema} from '@/lib/validators/customer';
import {AppError,handleActionError} from '@/lib/errors';
import {beautyManager} from '@/server/beauty/access';
import {assignCustomersAtomically,saveCustomerAttributionAtomically,findCustomerReferrers} from '@/server/services/customer-attribution-core';
import {FEATURES} from '@/lib/feature-flags';
import {requireStoreFeature} from '@/lib/feature-gate';
import type {ActionResult} from '@/types';

export async function bulkAssignBeautyCustomers(input:z.infer<typeof bulkUpdateCustomerAssignmentSchema>):Promise<ActionResult<{count:number}>>{
 try{
  const a=await beautyManager('customer.assign',true);
  const d=bulkUpdateCustomerAssignmentSchema.parse(input);
  await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  if(!a.userId)throw new AppError('FORBIDDEN','請重新登入');
  const count=await assignCustomersAtomically({storeId:a.storeId,userId:a.userId,customerIds:d.customerIds,assignedStaffId:d.assignedStaffId,eligibleStaff:{NOT:{user:{role:'CUSTOMER'}}},auditAction:'BEAUTY_BULK_ASSIGN',lockStore:async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${a.storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
   if(rows.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
  }});
  revalidatePath('/dashboard/beauty');revalidatePath('/dashboard');
  return {success:true,data:{count}};
 }catch(error){return handleActionError(error);}
}

export async function saveBeautyCustomerAttribution(input:z.infer<typeof updateCustomerAssignmentSchema>):Promise<ActionResult<void>>{
 try{
  const a=await beautyManager('customer.assign',true);
  const data=updateCustomerAssignmentSchema.parse(input);
  await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  if(!a.userId)throw new AppError('FORBIDDEN','請重新登入');
  await saveCustomerAttributionAtomically({storeId:a.storeId,userId:a.userId,data,eligibleStaff:{NOT:{user:{role:'CUSTOMER'}}},auditAction:'BEAUTY_CUSTOMER_ATTRIBUTION',lockStore:async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${a.storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
   if(rows.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
  }});
  revalidatePath('/dashboard/beauty');revalidatePath('/dashboard');
  return {success:true,data:undefined};
 }catch(error){return handleActionError(error);}
}

export async function searchBeautyReferrerCandidates(query:string,excludeCustomerId?:string):Promise<ActionResult<Array<{id:string;name:string;phoneMasked:string}>>>{
 try{
  const a=await beautyManager('customer.read');
  await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  return {success:true,data:await findCustomerReferrers(a.storeId,z.string().trim().max(100).parse(query),excludeCustomerId)};
 }catch(error){return handleActionError(error);}
}
