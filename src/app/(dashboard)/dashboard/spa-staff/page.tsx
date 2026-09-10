import { toLocalDateStr, parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { spaResourceStore } from "@/server/actions/spa-resources";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import { StaffScheduleWorkspace } from "./workspace";
export default async function SpaStaffPage({searchParams}:{searchParams:Promise<{month?:string}>}){
 const user=await getCurrentUser();if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"duty.manage"))notFound();
 const storeId=await spaResourceStore("duty.manage");
 const today=toLocalDateStr();const query=await searchParams;
 const month=query.month&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(query.month)?query.month:today.slice(0,7);
 const start=parseTaiwanDateToDbDate(`${month}-01`);const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
 const [staff,skills,links,shifts,exceptions]=await Promise.all([prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),spaPrisma.spaSkill.findMany({where:{storeId,isActive:true},select:{id:true,name:true}}),spaPrisma.spaStaffSkill.findMany({where:{storeId}}),spaPrisma.spaStaffAvailability.findMany({where:{storeId,isActive:true}}),spaPrisma.spaStaffAvailabilityException.findMany({where:{storeId,date:{gte:start,lt:end}}})]);
 return <StaffScheduleWorkspace people={staff.map(s=>({id:s.id,name:s.displayName,skillIds:links.filter(l=>l.staffId===s.id).map(l=>l.skillId),shifts:shifts.filter(l=>l.staffId===s.id).map(l=>({dayOfWeek:l.dayOfWeek,startTime:l.startTime,endTime:l.endTime}))}))} skills={skills} month={month} today={today} exceptions={exceptions.map(e=>({staffId:e.staffId,date:e.date.toISOString().slice(0,10),type:e.type,startTime:e.startTime,endTime:e.endTime}))}/>;
}
