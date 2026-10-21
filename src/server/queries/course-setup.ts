import "server-only";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { toLocalDateStr } from "@/lib/date-utils";
import { parseBusinessPeriods } from "@/lib/business-periods";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { courseSetupSteps } from "@/lib/course-setup-progress";
import { sportsEntitlementSnapshot } from "@/lib/sports-entitlement";
export function courseSetupCookieName(storeId:string,userId:string) {
  return `course-setup-v1-${createHash("sha256").update(`${storeId}:${userId}`).digest("hex").slice(0,24)}`;
}
export async function getCourseSetup(storeId:string,userId:string) {
  const native=sportsNativePreview(storeId);
  const [coaches,rooms,templates,plans,sessions,staff,music,hours,config,existingRooms,existingPlans,existingCoaches,latestSession] = await Promise.all([
    prisma.staff.count({where:{storeId,status:"ACTIVE",courseCoachEnabled:true}}),
    coursePrisma.courseRoom.count({where:{storeId,isActive:true}}),
    coursePrisma.courseTemplate.count({where:{storeId,isActive:true,visibility:{not:"OFF"}}}),
    coursePrisma.coursePointPlan.count({where:{storeId,isActive:true}}),
    coursePrisma.courseSession.count({where:{storeId,cancelledAt:null,releasedAt:null}}),
    prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true,courseQualificationsConfirmed:true},select:{courseQualifiedTemplateIds:true}}),
    prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}),
    prisma.businessHours.findMany({where:{storeId}}),
    prisma.shopConfig.findUnique({where:{storeId},select:{dutySchedulingEnabled:true}}),
    coursePrisma.courseRoom.count({where:{storeId}}),
    coursePrisma.coursePointPlan.count({where:{storeId}}),
    prisma.staff.count({where:{storeId,courseCoachEnabled:true}}),
    coursePrisma.courseSession.findFirst({where:{storeId,cancelledAt:null,releasedAt:null,endsAt:{gt:new Date()}},orderBy:{createdAt:"desc"},select:{id:true,startsAt:true}}),
  ]);
  const openDays=hours.filter(h=>h.isOpen && parseBusinessPeriods(h.segments,h).some(p=>p.openTime<p.closeTime)).length;
  const [subjects,existingCourses]=await Promise.all([
    music && !native ? coursePrisma.musicSubject.count({where:{storeId,isActive:true}}) : undefined,
    (music||native) ? coursePrisma.musicSubject.count({where:{storeId}}) : coursePrisma.courseTemplate.count({where:{storeId}}),
  ]);
  const [activeTemplates,activeSubjects,linkedPlans]=await Promise.all([
    coursePrisma.courseTemplate.findMany({where:{storeId,isActive:true,visibility:{not:"OFF"},...(native?{musicSubject:{isActive:true}}:{})},select:{id:true}}),
    native?coursePrisma.musicSubject.findMany({where:{storeId,isActive:true},select:{id:true}}):[],
    native?coursePrisma.coursePointPlan.findMany({where:{storeId,isActive:true},select:{templateIds:true,sportsMode:true,sportsSubjectId:true,sportsCost:true,unit:true}}):[],
  ]);
  const ids=new Set(activeTemplates.map(t=>t.id));
  const subjectIds=new Set(activeSubjects.map(s=>s.id));
  const usablePlans=linkedPlans.filter(p=>{
    if ((p.sportsMode??"LEGACY")==="LEGACY") return p.templateIds.some(id=>ids.has(id));
    try {
      const rights=sportsEntitlementSnapshot(p);
      return rights.sportsMode==="OPEN" || rights.sportsMode==="ASSIGNED" && subjectIds.has(rights.sportsSubjectId);
    } catch { return false; }
  });
  const qualifiedCoaches=staff.filter(s=>s.courseQualifiedTemplateIds.some(id=>ids.has(id))).length;
  const jar=await cookies();
  let preference:{mode:"show"|"later"|"never";login?:string}={mode:"show"};
  try { const parsed=JSON.parse(jar.get(courseSetupCookieName(storeId,userId))?.value??"{}");if(["show","later","never"].includes(parsed.mode))preference=parsed; } catch { /* Invalid preferences use the default reminder. */ }
  return {localSections:native,steps:courseSetupSteps({coaches,rooms,templates,subjects:native?activeSubjects.length:subjects,plans:native?usablePlans.length:plans,sessions,qualifiedCoaches,openDays,dutyEnabled:config?.dutySchedulingEnabled ?? false,existing:{hours:hours.length,rooms:existingRooms,courses:existingCourses,plans:existingPlans,coaches:existingCoaches}}, !!music,native),studentHref:latestSession?`/dashboard/courses?date=${toLocalDateStr(latestSession.startsAt)}&session=${encodeURIComponent(latestSession.id)}`:undefined,preference,login:jar.get("course-setup-login-v1")?.value??"existing-session"};
}
