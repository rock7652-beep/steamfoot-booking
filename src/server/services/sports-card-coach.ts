import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {cardChargeSettings,courseChargeAllowsProvider,courseChargeSettings} from "@/lib/course-charge-settings";

export function sportsCardCoachCheck(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string){
 const qualifications=new Map<string,Promise<Array<{courseQualifiedTemplateIds:string[]}>>>();
 return async (card:NonNullable<Parameters<typeof cardChargeSettings>[0]>,session:{templateId:string;coachId?:string})=>{
  const saved=cardChargeSettings(card);
  if(saved==null)return true;
  const charge=courseChargeSettings.safeParse(saved);
  const {coachId,templateId}=session;
  if(!charge.success||!coachId)return false;
  const current=courseChargeSettings.safeParse(card.plan?.chargeSettings);
  if(charge.data.providerScope!==undefined||!current.success||current.data.providerScope!=="QUALIFIED"){
   return courseChargeAllowsProvider(charge.data,coachId);
  }
  // A legacy list predates qualification-based plans. Check the scheduled item
  // against the same confirmed staff qualifications used when scheduling it.
  let staff=qualifications.get(coachId);
  if(!staff){
   staff=tx.$queryRaw<Array<{courseQualifiedTemplateIds:string[]}>>`
    SELECT "courseQualifiedTemplateIds" FROM "Staff"
    WHERE id=${coachId} AND "storeId"=${storeId} AND status::text='ACTIVE'
      AND "courseCoachEnabled" AND "courseQualificationsConfirmed"`;
   qualifications.set(coachId,staff);
  }
  return (await staff)[0]?.courseQualifiedTemplateIds.includes(templateId)??false;
 };
}
