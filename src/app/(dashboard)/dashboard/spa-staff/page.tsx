import { getSpaServiceStaff } from "@/server/queries/spa-service-staff";
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
 const assignments=await getSpaServiceStaff(storeId);
 const [staff,shifts,exceptions,pendingBookings]=await Promise.all([prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true,isOwner:true,user:{select:{phone:true,status:true,passwordHash:true,email:true}}},orderBy:{displayName:"asc"}}),spaPrisma.spaStaffAvailability.findMany({where:{storeId,isActive:true}}),spaPrisma.spaStaffAvailabilityException.findMany({where:{storeId,date:{gte:start,lt:end}}}),spaPrisma.spaBooking.groupBy({by:["serviceStaffId"],where:{storeId,status:{in:["PENDING","CONFIRMED"]}},_count:{_all:true}})]);
 return <StaffScheduleWorkspace people={staff.map(s=>({id:s.id,name:s.displayName,phone:s.user.phone??"",editable:!s.isOwner&&s.id.startsWith(`spa-person:${storeId}:`)&&s.user.status==="SUSPENDED"&&!s.user.passwordHash&&!s.user.email,pendingBookings:pendingBookings.find(b=>b.serviceStaffId===s.id)?._count._all??0,treatmentIds:assignments.services.filter(t=>t.staffIds.includes(s.id)).map(t=>t.id),shifts:shifts.filter(l=>l.staffId===s.id).map(l=>({dayOfWeek:l.dayOfWeek,startTime:l.startTime,endTime:l.endTime}))}))} services={assignments.services} month={month} today={today} exceptions={exceptions.map(e=>({staffId:e.staffId,date:e.date.toISOString().slice(0,10),type:e.type,startTime:e.startTime,endTime:e.endTime}))}/>;
}
