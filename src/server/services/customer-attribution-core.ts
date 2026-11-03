import "server-only";
import type {Prisma} from "@prisma/client";
import {prisma} from "@/lib/db";
import {AppError} from "@/lib/errors";
import {normalizePhone} from "@/lib/normalize";

/** Original sports all-or-nothing customer assignment, shared across module cores. */
export async function assignCustomersAtomically({storeId,userId,customerIds,assignedStaffId,lockStore,eligibleStaff,auditAction}:{
 storeId:string;userId:string;customerIds:string[];assignedStaffId:string;
 lockStore:(tx:Prisma.TransactionClient)=>Promise<void>;
 eligibleStaff:Prisma.StaffWhereInput;auditAction:string;
}){
 const ids=[...new Set(customerIds)];
 return prisma.$transaction(async tx=>{
  await lockStore(tx);
  const staff=await tx.staff.findFirst({where:{...eligibleStaff,id:assignedStaffId,storeId,status:'ACTIVE',user:{status:'ACTIVE'}},select:{id:true}});
  if(!staff)throw new AppError('VALIDATION','請選擇本店啟用中的所屬店長');
  const customers=await tx.customer.findMany({where:{id:{in:ids},storeId,mergedIntoCustomerId:null,OR:[{userId:null},{user:{status:'ACTIVE'}}]},select:{id:true,assignedStaffId:true}});
  if(customers.length!==ids.length)throw new AppError('CONFLICT','選取資料包含已停用、已合併或非本店顧客，本批未儲存，請重新核對。');
  const result=await tx.customer.updateMany({where:{id:{in:ids},storeId},data:{assignedStaffId:staff.id}});
  await tx.auditLog.create({data:{actorUserId:userId,targetType:'Customer',targetId:storeId,action:auditAction,beforeJson:customers,afterJson:{customerIds:ids,assignedStaffId:staff.id}}});
  return result.count;
 });
}

export async function saveCustomerAttributionAtomically({storeId,userId,data,lockStore,eligibleStaff,preserveStaff=false,auditAction}:{
 storeId:string;userId:string;data:{customerId:string;assignedStaffId:string;referredByCustomerId?:string|null};
 lockStore:(tx:Prisma.TransactionClient)=>Promise<void>;eligibleStaff:Prisma.StaffWhereInput;preserveStaff?:boolean;auditAction:string;
}){
 await prisma.$transaction(async tx=>{
  await lockStore(tx);
  const customer=await tx.customer.findFirst({where:{id:data.customerId,storeId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError('NOT_FOUND','找不到本店顧客');
  const staff=preserveStaff?null:await tx.staff.findFirst({where:{...eligibleStaff,id:data.assignedStaffId||'__none__',storeId,status:'ACTIVE',user:{status:'ACTIVE'}},select:{id:true}});
  if(!preserveStaff&&!staff)throw new AppError('VALIDATION','請選擇本店啟用中的所屬店長');
  const sponsorId=data.referredByCustomerId??null;
  if(sponsorId){
   if(sponsorId===customer.id)throw new AppError('VALIDATION','推薦人不可為本人');
   const sponsor=await tx.customer.findFirst({where:{id:sponsorId,storeId,mergedIntoCustomerId:null},select:{id:true}});
   if(!sponsor)throw new AppError('VALIDATION','推薦人必須是本店顧客');
  }
  await tx.customer.update({where:{id:customer.id,storeId},data:{...(staff?{assignedStaffId:staff.id}:{}),sponsorId}});
  await tx.auditLog.create({data:{actorUserId:userId,targetType:'Customer',targetId:customer.id,action:auditAction,afterJson:{assignedStaffId:staff?.id??null,sponsorId}}});
 });
}

export async function findCustomerReferrers(storeId:string,q:string,excludeCustomerId?:string){
 if(!q)return [];
 const digits=normalizePhone(q);
 const matches=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,...(excludeCustomerId?{id:{not:excludeCustomerId}}:{}),OR:[{name:{contains:q,mode:'insensitive'}},...(/\d/.test(q)&&digits?[{phone:{contains:digits}}]:[])]},select:{id:true,name:true,phone:true},orderBy:{name:'asc'},take:10});
 return matches.map(person=>({id:person.id,name:person.name,phoneMasked:person.phone.length>7?`${person.phone.slice(0,4)}•••${person.phone.slice(-3)}`:person.phone}));
}
