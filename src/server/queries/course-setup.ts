import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { courseSetupSteps } from "@/lib/course-setup-progress";
export function courseSetupCookieName(storeId:string,userId:string) {
  return `course-setup-v1-${createHash("sha256").update(`${storeId}:${userId}`).digest("hex").slice(0,24)}`;
}
export async function getCourseSetup(storeId:string,userId:string) {
  const [coaches,rooms,templates,plans,sessions,staff] = await Promise.all([
    prisma.staff.count({where:{storeId,status:"ACTIVE",courseCoachEnabled:true,user:{status:"ACTIVE"}}}),
    coursePrisma.courseRoom.count({where:{storeId,isActive:true}}),
    coursePrisma.courseTemplate.count({where:{storeId,isActive:true,visibility:{not:"OFF"}}}),
    coursePrisma.coursePointPlan.count({where:{storeId,isActive:true}}),
    coursePrisma.courseSession.count({where:{storeId,cancelledAt:null,releasedAt:null}}),
    prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true,courseQualificationsConfirmed:true,user:{status:"ACTIVE"}},select:{courseQualifiedTemplateIds:true}}),
  ]);
  const activeTemplates=await coursePrisma.courseTemplate.findMany({where:{storeId,isActive:true,visibility:{not:"OFF"}},select:{id:true}});
  const ids=new Set(activeTemplates.map(t=>t.id));
  const qualifiedCoaches=staff.filter(s=>s.courseQualifiedTemplateIds.some(id=>ids.has(id))).length;
  const jar=await cookies();
  let preference:{mode:"show"|"later"|"never";login?:string}={mode:"show"};
  try { const parsed=JSON.parse(jar.get(courseSetupCookieName(storeId,userId))?.value??"{}");if(["show","later","never"].includes(parsed.mode))preference=parsed; } catch { /* Invalid preferences use the default reminder. */ }
  return {steps:courseSetupSteps({coaches,rooms,templates,plans,sessions,qualifiedCoaches}),preference,login:jar.get("course-setup-login-v1")?.value??"existing-session"};
}
