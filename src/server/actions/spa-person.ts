"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature, getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { Prisma } from "@prisma/client";
const schema=z.object({name:z.string().trim().min(1,"請填姓名").max(100),phone:z.string().trim().max(20).optional(),requestKey:z.string().uuid()});

const memberSchema=z.object({customerId:z.string().min(1),requestKey:z.string().uuid()});
const linkSchema=z.object({customerId:z.string().min(1),staffId:z.string().min(1)});

function maskPhone(phone:string){
 if(phone.length<7)return "手機已設定";
 return `${phone.slice(0,4)}•••${phone.slice(-3)}`;
}

async function requireSpaStaffOwner(){
 const user=await requirePermission("duty.manage");
 if(user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可管理服務人員");
 const storeId=await spaResourceStore("duty.manage");
 await requireStoreFeature(storeId,FEATURES.STAFF_MANAGEMENT);
 return{user,storeId};
}

/** Search is display-only. The mutation re-resolves the fixed identity link. */
export async function searchSpaStaffMembers(input:{query:string}){
 try{
  const{storeId}=await requireSpaStaffOwner();const query=z.string().trim().max(60).parse(input.query);
  if(query.length<1)return{success:true as const,members:[]};
  const customers=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,AND:[{OR:[{name:{contains:query,mode:"insensitive"}},{phone:{contains:query}}]},{OR:[{userId:{not:null}},{identityLinks:{some:{userId:{not:""}}}}]}]},select:{id:true,name:true,phone:true,userId:true,lineLinkStatus:true,identityLinks:{select:{userId:true,provider:true},take:5},},take:20,orderBy:{name:"asc"}});
  const userIds=[...new Set(customers.flatMap(c=>[c.userId,...c.identityLinks.map(l=>l.userId)].filter((v):v is string=>!!v)))];
  const [users,links]=await Promise.all([prisma.user.findMany({where:{id:{in:userIds},status:"ACTIVE"},select:{id:true}}),prisma.staffMemberLink.findMany({where:{storeId,userId:{in:userIds}},select:{userId:true,staffId:true,revokedAt:true}})]);
  const activeUsers=new Set(users.map(u=>u.id));
  return{success:true as const,members:customers.flatMap(c=>{const ids=[c.userId,...c.identityLinks.map(l=>l.userId)].filter((v):v is string=>!!v&&activeUsers.has(v));const unique=[...new Set(ids)];if(unique.length!==1)return[];const linked=links.find(l=>l.userId===unique[0]);return[{customerId:c.id,name:c.name,maskedPhone:maskPhone(c.phone),lineLinked:c.identityLinks.some(l=>l.provider.includes("line"))||c.lineLinkStatus==="LINKED",staffId:linked?.staffId??null,workAccess:!!linked&&!linked.revokedAt}];})};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"搜尋失敗":r.error};}
}

async function resolveMemberInTransaction(tx:Prisma.TransactionClient,storeId:string,customerId:string){
 const customer=await tx.customer.findFirst({where:{id:customerId,storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true,userId:true,identityLinks:{select:{userId:true}}}});
 if(!customer)throw new AppError("NOT_FOUND","找不到本店會員");
 const ids=[customer.userId,...customer.identityLinks.map(l=>l.userId)].filter((v):v is string=>!!v);
 const unique=[...new Set(ids)];
 if(unique.length!==1)throw new AppError("CONFLICT","此會員的登入身分尚未完成或有衝突，請先處理會員綁定");
 const member=await tx.user.findFirst({where:{id:unique[0],status:"ACTIVE"},select:{id:true}});
 if(!member)throw new AppError("FORBIDDEN","會員帳號未啟用");
 return{...customer,memberUserId:member.id};
}

export async function createSpaPersonFromMember(input:z.infer<typeof memberSchema>){
 try{
  const{user,storeId}=await requireSpaStaffOwner();const d=memberSchema.parse(input);const limits=await getStoreLimitsByStoreId(storeId);const staffId=`spa-person:${storeId}:${d.requestKey}`;
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-member-staff:${storeId}`}, 0))`;
   const member=await resolveMemberInTransaction(tx,storeId,d.customerId);
   const existing=await tx.staffMemberLink.findUnique({where:{uq_staff_member_link_user_store:{userId:member.memberUserId,storeId}},select:{staffId:true,revokedAt:true}});
   if(existing){if(existing.revokedAt){await tx.staffMemberLink.update({where:{uq_staff_member_link_user_store:{userId:member.memberUserId,storeId}},data:{revokedAt:null,linkedAt:new Date(),linkedByUserId:user.id}});await tx.staff.update({where:{id:existing.staffId},data:{status:"ACTIVE"}});}return{staffId:existing.staffId,name:member.name};}
   const count=await tx.staff.count({where:{storeId,status:"ACTIVE"}});if(limits.maxStaff!==null&&count>=limits.maxStaff)throw new AppError("FORBIDDEN","已達方案可用人員數量上限");
   // Synthetic operational user remains login-disabled and has no phone, so it
   // cannot collide with or impersonate the real member account.
   await tx.user.create({data:{id:`spa-person-user:${storeId}:${d.requestKey}`,name:member.name,phone:null,role:"CUSTOMER",status:"SUSPENDED",staff:{create:{id:staffId,storeId,displayName:member.name,colorCode:["#6366f1","#0d9488","#e11d48","#d97706","#7c3aed","#2563eb"][count%6],isOwner:false,status:"ACTIVE",spaceFeeEnabled:false}}}});
   await tx.staffMemberLink.create({data:{userId:member.memberUserId,storeId,staffId,linkedByUserId:user.id}});
   return{staffId,name:member.name};
  });
  revalidatePath("/dashboard/spa-staff");return{success:true as const,...result};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"加入失敗":r.error};}
}

export async function linkSpaPersonToMember(input:z.infer<typeof linkSchema>){
 try{
  const{user,storeId}=await requireSpaStaffOwner();const d=linkSchema.parse(input);
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-member-staff:${storeId}`}, 0))`;
   const [member,staff]=await Promise.all([resolveMemberInTransaction(tx,storeId,d.customerId),tx.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"},select:{id:true}})]);
   if(!staff)throw new AppError("NOT_FOUND","找不到本店人員");
   const other=await tx.staffMemberLink.findUnique({where:{uq_staff_member_link_user_store:{userId:member.memberUserId,storeId}},select:{staffId:true}});
   if(other&&other.staffId!==staff.id)throw new AppError("CONFLICT","此會員已連結另一位人員");
   await tx.staffMemberLink.upsert({where:{uq_staff_member_link_staff_store:{staffId:staff.id,storeId}},create:{userId:member.memberUserId,storeId,staffId:staff.id,linkedByUserId:user.id},update:{userId:member.memberUserId,revokedAt:null,linkedAt:new Date(),linkedByUserId:user.id}});
   await tx.staff.update({where:{id:staff.id},data:{displayName:member.name}});return{name:member.name};
  });
  revalidatePath("/dashboard/spa-staff");return{success:true as const,...result};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"連結失敗":r.error};}
}
/** Creates a scheduling person only, never a login-capable staff account. */
export async function createSpaPerson(input:z.infer<typeof schema>){
 try{
  const user=await requirePermission("duty.manage");
  if(user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可新增服務人員");
  const storeId=await spaResourceStore("duty.manage");const d=schema.parse(input);
  await requireStoreFeature(storeId,FEATURES.STAFF_MANAGEMENT);
  const limits=await getStoreLimitsByStoreId(storeId);
  const staffId=`spa-person:${storeId}:${d.requestKey}`;
  await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   if(await tx.staff.findFirst({where:{id:staffId,storeId}}))return;
   const count=await tx.staff.count({where:{storeId,status:"ACTIVE"}});
   if(limits.maxStaff!==null&&count>=limits.maxStaff)throw new AppError("FORBIDDEN","已達方案可用人員數量上限");
   await tx.user.create({data:{id:`spa-person-user:${storeId}:${d.requestKey}`,name:d.name,phone:d.phone||null,role:"CUSTOMER",status:"SUSPENDED",email:null,passwordHash:null,staff:{create:{id:staffId,storeId,displayName:d.name,colorCode:["#6366f1","#0d9488","#e11d48","#d97706","#7c3aed","#2563eb"][count%6],isOwner:false,status:"ACTIVE",spaceFeeEnabled:false}}}});
  });
  revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/plans");revalidatePath("/dashboard/spa-schedule");
  return{success:true as const,staffId};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"新增失敗":r.error};}
}

const personEdit=z.object({staffId:z.string().min(1),name:z.string().trim().min(1,"請填姓名").max(100),phone:z.string().trim().max(20),deactivate:z.boolean()});
export async function updateSpaPerson(input:z.infer<typeof personEdit>){
 try{
  const user=await requirePermission("duty.manage");
  if(user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可修改服務人員");
  const storeId=await spaResourceStore("duty.manage"),d=personEdit.parse(input);
  await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   const person=await tx.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"},include:{user:true,memberLink:true}});
   const editableSynthetic=!!person&&!person.isOwner&&person.id.startsWith(`spa-person:${storeId}:`)&&person.user.status==="SUSPENDED"&&!person.user.passwordHash&&!person.user.email;
   const linkedDeactivation=!!person?.memberLink&&d.deactivate;
   if(!person||(!editableSynthetic&&!linkedDeactivation))throw new AppError("FORBIDDEN","已連結會員的姓名與電話請從會員資料調整");
   if(d.deactivate){
    const bookings=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "SpaBooking" WHERE "storeId"=${storeId} AND "serviceStaffId"=${d.staffId} AND "status" IN ('PENDING','CONFIRMED')`;
    if(bookings.length)throw new AppError("CONFLICT",`此人員仍有 ${bookings.length} 筆未完成預約，請先改派或取消後再停用`);
    await tx.staffMemberLink.updateMany({where:{staffId:d.staffId,storeId,revokedAt:null},data:{revokedAt:new Date()}});
   }
   if(!person.memberLink)await tx.user.update({where:{id:person.userId},data:{name:d.name,phone:d.phone||null}});
   await tx.staff.update({where:{id:person.id},data:{...(!person.memberLink?{displayName:d.name}:{}),...(d.deactivate?{status:"INACTIVE" as const}:{})}});
  });
  revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/plans");revalidatePath("/dashboard/spa-schedule");return{success:true as const};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"修改失敗":r.error};}
}
