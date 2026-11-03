import "server-only";
import {courseCalendarRead} from "./course-calendar-read-scope";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {sportsScheduleRule} from "@/lib/sports-staging-types";
import type {Prisma} from "../../../generated/course-client";
import {readSportsSessionRuleRow} from "./sports-session-rule-read";
export async function sessionWaitlistPolicy(tx:Pick<Prisma.TransactionClient,"$queryRaw"|"courseBookingRule">,storeId:string,sessionId:string,fallback:{waitlistEnabled:boolean;waitlistLimit:number;waitlistStopMinutes:number|null}) {
  if(!(await sportsNativePreview(storeId)))return fallback;
  const calendar=courseCalendarRead(tx,storeId,sessionId);
  const readMode=()=>tx.courseBookingRule.findUnique({where:{storeId},select:{selfBookingEnabled:true}});
  const mode=await (calendar?calendar.once("waitlist-mode",readMode):readMode());
  if(mode?.selfBookingEnabled===false)return {...fallback,waitlistEnabled:false};
  const row=await readSportsSessionRuleRow(tx,storeId,sessionId);
  const parsed=sportsScheduleRule.safeParse(row?.payload);
  if(!parsed.success||!parsed.data.waitlist)return fallback;
  return {waitlistEnabled:parsed.data.enrollment==="OPEN"&&parsed.data.waitlist.limit>0,waitlistLimit:parsed.data.waitlist.limit,waitlistStopMinutes:parsed.data.waitlist.stopMinutes};
}
