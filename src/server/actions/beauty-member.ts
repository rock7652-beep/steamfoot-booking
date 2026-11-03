"use server";
import {z} from 'zod';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {prisma} from '@/lib/db';
import {beautyMember} from '@/server/beauty/access';
import {beautyHealthEnabled} from '@/server/beauty/health';
import {AppError,handleActionError} from '@/lib/errors';
import {healthRecordInputSchema} from '@/lib/health-record-input';
import {getNativeHealthSummary,calculateNativeBmi} from '@/lib/native-health-service';
import {parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import {parseBirthday} from '@/lib/birthday';
import {compareSync,hashSync} from 'bcryptjs';
import {revalidatePath} from 'next/cache';
async function healthActor(write=false){const a=await beautyMember(write);await requireStoreFeature(a.storeId,FEATURES.MEMBER_PORTAL);if(!await beautyHealthEnabled(a.storeId))throw new AppError('FORBIDDEN','店家未開放健康追蹤');return a;}
export async function loadBeautyMemberHealth(){
 try{const a=await healthActor();const [summary,records]=await Promise.all([getNativeHealthSummary(a.customerId!,a.storeId),prisma.customerHealthRecord.findMany({where:{storeId:a.storeId,customerId:a.customerId},orderBy:[{measuredAt:'desc'},{createdAt:'desc'}],take:100})]);return {success:true as const,data:{summary,records:records.map(r=>({...r,measuredAt:r.measuredAt.toISOString().slice(0,10),createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()}))}};}catch(e){return handleActionError(e);}
}
export async function saveBeautyMemberHealth(input:unknown){
 try{const a=await healthActor(true),{id}=z.object({id:z.string().min(1).optional()}).parse(input),{requestId,measuredAt,...metrics}=healthRecordInputSchema.parse(input);
 if(!parseTaipeiDateTime(measuredAt,'00:00')||measuredAt>toLocalDateStr())throw new AppError('VALIDATION','請選擇今天或之前的有效量測日期');
 await prisma.$transaction(async tx=>{const customer=await tx.customer.findFirst({where:{storeId:a.storeId,id:a.customerId,mergedIntoCustomerId:null},select:{height:true}});if(!customer)throw new AppError('NOT_FOUND','找不到本店會員');const data={...metrics,bmi:metrics.bmi??calculateNativeBmi(metrics.weight,customer.height),measuredAt:new Date(measuredAt+'T00:00:00.000Z')};
 if(id){const r=await tx.customerHealthRecord.updateMany({where:{id,storeId:a.storeId,customerId:a.customerId},data});if(!r.count)throw new AppError('NOT_FOUND','找不到本人量測紀錄');}else{const sourceRecordId=`${a.storeId}:${a.customerId}:${requestId}`;await tx.customerHealthRecord.upsert({where:{uq_health_source_record:{source:'BEAUTY',sourceRecordId}},create:{...data,storeId:a.storeId,customerId:a.customerId!,source:'BEAUTY',sourceRecordId},update:{}});}});
 revalidatePath('/beauty');return {success:true as const};}catch(e){return handleActionError(e);}
}
export async function saveBeautyMemberProfile(input:unknown){
 try{const a=await beautyMember(true),d=z.object({name:z.string().trim().min(1).max(100),birthday:z.string().default('')}).parse(input);const parsed=d.birthday?parseBirthday(d.birthday):null;if(parsed&&!parsed.success)throw new AppError('VALIDATION',parsed.error);const birthday=parsed?.success?parsed.value:null;
 await prisma.$transaction(async tx=>{const r=await tx.customer.updateMany({where:{storeId:a.storeId,id:a.customerId,mergedIntoCustomerId:null},data:{name:d.name,birthday}});if(r.count!==1)throw new AppError('NOT_FOUND','找不到本店會員');await tx.user.update({where:{id:a.userId!},data:{name:d.name}});});revalidatePath('/beauty');return {success:true as const};}catch(e){return handleActionError(e);}
}
export async function saveBeautyMemberPassword(input:unknown){
 try{const a=await beautyMember(true),d=z.object({currentPassword:z.string().min(1).max(200),password:z.string().min(8,'新密碼至少8字元').max(100),confirmPassword:z.string()}).refine(d=>d.password===d.confirmPassword,'兩次新密碼不一致').parse(input);const user=await prisma.user.findUnique({where:{id:a.userId!},select:{passwordHash:true}});if(!user?.passwordHash||!compareSync(d.currentPassword,user.passwordHash))throw new AppError('FORBIDDEN','目前密碼不正確');const r=await prisma.user.updateMany({where:{id:a.userId!,passwordHash:user.passwordHash,status:'ACTIVE'},data:{passwordHash:hashSync(d.password,10)}});if(r.count!==1)throw new AppError('CONFLICT','帳號已更新，請重新登入');return {success:true as const};}catch(e){return handleActionError(e);}
}
