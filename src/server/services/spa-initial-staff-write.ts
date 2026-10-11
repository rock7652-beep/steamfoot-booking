import "server-only";
import type {Prisma} from "@prisma/client";
import {AppError} from "@/lib/errors";
import {SPA_SKILLS,spaSkillId} from "@/lib/spa-store-identifiers";
/** Shared account creation already owns the transaction. Write only explicitly
 * authorized SPA setup on that connection, never Steam bookings. Batch each
 * collection to avoid a separate network round trip per skill or weekday. */
export async function writeInitialSpaStaff(tx:Pick<Prisma.TransactionClient,"$executeRaw">,storeId:string,staffId:string,data:{spaSkillKeys?:Array<"body"|"head"|"foot"|"face">;spaWeeklyAvailability?:Array<{dayOfWeek:number;startTime:string;endTime:string}>;spaCompensation?:{mode:"PERCENTAGE"|"FIXED";value:number}}){
 const skills=SPA_SKILLS.flatMap((skill,sortOrder)=>data.spaSkillKeys?.includes(skill.key)?[{id:spaSkillId(storeId,skill.key),name:skill.name,sortOrder}]:[]);
 if(skills.length){
  const json=JSON.stringify(skills);
  const changed=await tx.$executeRaw`INSERT INTO "SpaSkill" (id,"storeId",name,"isActive","sortOrder","createdAt","updatedAt") SELECT x.id,${storeId},x.name,true,x."sortOrder",now(),now() FROM jsonb_to_recordset(${json}::jsonb) AS x(id text,name text,"sortOrder" int) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,"sortOrder"=EXCLUDED."sortOrder","isActive"=true,"updatedAt"=now() WHERE "SpaSkill"."storeId"=EXCLUDED."storeId"`;
  if(changed!==skills.length)throw new AppError("CONFLICT","專業項目識別碼已被其他門市使用");
  await tx.$executeRaw`INSERT INTO "SpaStaffSkill" ("storeId","staffId","skillId") SELECT ${storeId},${staffId},x.id FROM jsonb_to_recordset(${json}::jsonb) AS x(id text)`;
 }
 if(data.spaWeeklyAvailability?.length){
  const rows=data.spaWeeklyAvailability.map(row=>({...row,id:crypto.randomUUID()}));
  await tx.$executeRaw`INSERT INTO "SpaStaffAvailability" (id,"storeId","staffId","dayOfWeek","startTime","endTime","isActive","createdAt","updatedAt") SELECT x.id,${storeId},${staffId},x."dayOfWeek",x."startTime",x."endTime",true,now(),now() FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text,"dayOfWeek" int,"startTime" text,"endTime" text)`;
 }
 if(data.spaCompensation){
  const changed=await tx.$executeRaw`INSERT INTO "SpaStaffCompensation" (id,"storeId","staffId",mode,value,"isActive","createdAt","updatedAt") VALUES (${crypto.randomUUID()},${storeId},${staffId},${data.spaCompensation.mode},${data.spaCompensation.value},true,now(),now()) ON CONFLICT ("staffId") DO UPDATE SET mode=EXCLUDED.mode,value=EXCLUDED.value,"isActive"=true,"updatedAt"=now() WHERE "SpaStaffCompensation"."storeId"=EXCLUDED."storeId"`;
  if(changed!==1)throw new AppError("CONFLICT","抽成資料不屬於本店");
 }
}
