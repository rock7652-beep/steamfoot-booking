import "server-only";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {sportsScheduleRule} from "@/lib/sports-staging-types";
import type {Prisma} from "../../../generated/course-client";
export async function sessionWaitlistPolicy(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string,sessionId:string,fallback:{waitlistEnabled:boolean;waitlistLimit:number;waitlistStopMinutes:number|null}) {
  if(!sportsNativePreview(storeId))return fallback;
  const rows=await tx.$queryRaw<Array<{payload:unknown}>>`SELECT payload FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  const parsed=sportsScheduleRule.safeParse(rows[0]?.payload);
  if(!parsed.success||!parsed.data.waitlist)return fallback;
  return {waitlistEnabled:parsed.data.enrollment==="OPEN"&&parsed.data.waitlist.limit>0,waitlistLimit:parsed.data.waitlist.limit,waitlistStopMinutes:parsed.data.waitlist.stopMinutes};
}
