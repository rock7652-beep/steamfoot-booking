import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { spaResourceStore } from "@/server/actions/spa-resources";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import { StaffScheduleWorkspace } from "./workspace";
export default async function SpaStaffPage(){
 const user=await getCurrentUser();if(!user||user.role!=="OWNER"||!await checkPermission(user.role,user.staffId,"duty.manage"))notFound();
 const storeId=await spaResourceStore("duty.manage");
 const [staff,skills,links,shifts]=await Promise.all([prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),spaPrisma.spaSkill.findMany({where:{storeId,isActive:true},select:{id:true,name:true}}),spaPrisma.spaStaffSkill.findMany({where:{storeId}}),spaPrisma.spaStaffAvailability.findMany({where:{storeId,isActive:true}})]);
 return <StaffScheduleWorkspace people={staff.map(s=>({id:s.id,name:s.displayName,skillIds:links.filter(l=>l.staffId===s.id).map(l=>l.skillId),shifts:shifts.filter(l=>l.staffId===s.id).map(l=>({dayOfWeek:l.dayOfWeek,startTime:l.startTime,endTime:l.endTime}))}))} skills={skills}/>;
}
