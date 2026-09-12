import "server-only";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
export async function getSpaServiceStaff(storeId:string){
 const [people,services,links]=await Promise.all([
  prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
  spaPrisma.spaTreatment.findMany({where:{storeId},include:{skills:true,serviceLocations:true},orderBy:{sortOrder:"asc"}}),
  spaPrisma.spaStaffSkill.findMany({where:{storeId,skill:{isActive:true}}}),
 ]);
 return {people:people.map(p=>({id:p.id,name:p.displayName})),services:services.map(t=>({id:t.id,name:[t.name,t.variantLabel].filter(Boolean).join(" · "),baseName:t.name,variantLabel:t.variantLabel??"",price:Number(t.price),serviceMinutes:t.serviceMinutes,bufferMinutes:t.bufferMinutes,publicVisible:t.publicVisible,locationIds:t.serviceLocations.map(l=>l.serviceLocationId),isActive:t.isActive,staffIds:people.filter(p=>t.skills.every(s=>links.some(l=>l.staffId===p.id&&l.skillId===s.skillId))).map(p=>p.id)}))};
}
