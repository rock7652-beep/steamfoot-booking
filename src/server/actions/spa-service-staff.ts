"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import type { Prisma } from "../../../generated/spa-client";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { spaEndTime, staffAvailable, validSpaDate } from "@/lib/spa-scheduling";
// A private one-to-one capability per service encodes the direct relation in the
// existing isolated SPA tables. Existing category-based eligibility is copied on
// the first edit; changing a service never changes another service's providers.
async function setProviders(tx:Prisma.TransactionClient,storeId:string,treatmentId:string,staffIds:string[]){
 const id=`spa-service:${treatmentId}`;
 const capability=await tx.spaSkill.findUnique({where:{id}});
 if(capability&&capability.storeId!==storeId)throw new AppError("FORBIDDEN","服務關聯店別不符");
 await tx.spaSkill.upsert({where:{id},create:{id,storeId,name:`__service__:${treatmentId}`,isActive:true},update:{isActive:true}});
 await tx.spaTreatmentSkill.deleteMany({where:{storeId,treatmentId}});
 await tx.spaTreatmentSkill.create({data:{storeId,treatmentId,skillId:id}});
 await tx.spaStaffSkill.deleteMany({where:{storeId,skillId:id}});
 await tx.spaStaffSkill.createMany({data:[...new Set(staffIds)].map(staffId=>({storeId,staffId,skillId:id}))});
}
function refresh(){revalidatePath("/dashboard/plans");revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/spa-schedule");}
export async function saveSpaServiceProviders(input:{treatmentId:string;staffIds:string[]}){
 try{
  const storeId=await spaResourceStore("wallet.create");const d=z.object({treatmentId:z.string().min(1),staffIds:z.array(z.string()).max(200)}).parse(input);
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   if(!await tx.spaTreatment.findFirst({where:{id:d.treatmentId,storeId}}))throw new AppError("FORBIDDEN","找不到本店服務");
   const ids=[...new Set(d.staffIds)];
   if(await prisma.staff.count({where:{storeId,id:{in:ids},status:"ACTIVE"}})!==ids.length)throw new AppError("VALIDATION","請選擇本店啟用人員");
   await setProviders(tx,storeId,d.treatmentId,ids);
  });refresh();return{success:true as const};
 }catch(e){return handleActionError(e);}
}
export async function saveSpaPersonServices(input:{staffId:string;treatmentIds:string[]}){
 try{
  const storeId=await spaResourceStore("duty.manage");const d=z.object({staffId:z.string().min(1),treatmentIds:z.array(z.string()).max(500)}).parse(input);
  if(!await prisma.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"}}))throw new AppError("FORBIDDEN","找不到本店人員");
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   const [services,links,people]=await Promise.all([tx.spaTreatment.findMany({where:{storeId},include:{skills:true}}),tx.spaStaffSkill.findMany({where:{storeId,skill:{isActive:true}}}),prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true}})]);
   if(d.treatmentIds.some(id=>!services.some(t=>t.id===id)))throw new AppError("VALIDATION","服務不屬於本店");
   for(const t of services){
    const current=people.filter(p=>t.skills.every(s=>links.some(l=>l.staffId===p.id&&l.skillId===s.skillId))).map(p=>p.id);
    const wanted=d.treatmentIds.includes(t.id);
    if(current.includes(d.staffId)===wanted)continue;
    await setProviders(tx,storeId,t.id,wanted?[...current,d.staffId]:current.filter(id=>id!==d.staffId));
   }
  });refresh();return{success:true as const};
 }catch(e){return handleActionError(e);}
}
export async function getSpaAvailableProviders(input:{date:string;startTime:string;treatmentIds:string[];bookingId?:string}){
 try{
  const storeId=await spaResourceStore("booking.read");const d=z.object({date:z.string().refine(validSpaDate),startTime:z.string(),treatmentIds:z.array(z.string()).min(1).max(20),bookingId:z.string().optional()}).parse(input);
  const treatments=await spaPrisma.spaTreatment.findMany({where:{storeId,id:{in:d.treatmentIds},isActive:true},include:{skills:true}});
  if(treatments.length!==new Set(d.treatmentIds).size)throw new AppError("VALIDATION","請重新選擇服務");
  const end=spaEndTime(d.startTime,treatments),date=parseTaiwanDateToDbDate(d.date);
  const [people,links,regular,exceptions,bookings]=await Promise.all([
   prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true}}),
   spaPrisma.spaStaffSkill.findMany({where:{storeId,skill:{isActive:true}}}),
   spaPrisma.spaStaffAvailability.findMany({where:{storeId,dayOfWeek:date.getUTCDay()}}),
   spaPrisma.spaStaffAvailabilityException.findMany({where:{storeId,date}}),
   spaPrisma.spaBooking.findMany({where:{storeId,bookingDate:date,status:{in:["PENDING","CONFIRMED"]},startTime:{lt:end},endTime:{gt:d.startTime},...(d.bookingId?{id:{not:d.bookingId}}:{})},select:{serviceStaffId:true}}),
  ]);
  return{success:true as const,people:people.filter(p=>treatments.every(t=>t.skills.every(s=>links.some(l=>l.staffId===p.id&&l.skillId===s.skillId)))&&staffAvailable(d.startTime,end,regular.find(r=>r.staffId===p.id)??null,exceptions.filter(e=>e.staffId===p.id))&&!bookings.some(b=>b.serviceStaffId===p.id)).map(p=>({id:p.id,name:p.displayName}))};
 }catch(e){const result=handleActionError(e);return {success:false as const,error:result.success?"查詢失敗":result.error};}
}
