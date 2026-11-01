import "server-only";
import {courseCalendarRead} from "./course-calendar-read-scope";
import type {Prisma} from "../../../generated/course-client";
import type {SportsScheduleRule} from "@/lib/sports-staging-types";
import {memoizeCourseReadRequest} from "./course-read-request-memo";

/** Store-scoped persisted evidence, not a substitute for readiness or grants. */
export async function readSportsSessionRuleRow(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string,sessionId:string){
  const calendar=courseCalendarRead(tx,storeId,sessionId);
  if(calendar){
   const rows=await calendar.once('sports-rules',()=>tx.$queryRaw<Array<{sessionId:string;frequency:string;enrollment:string;planId:string|null;trialPrice:number;payload:SportsScheduleRule}>>`SELECT "sessionId",frequency,enrollment,"planId","trialPrice",payload FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} AND "sessionId"=ANY(${[...calendar.sessionIds]}::text[])`);
   const row=rows.find(row=>row.sessionId===sessionId);if(!row)return null;
   const {sessionId:_id,...rule}=row;void _id;return rule;
  }
  return memoizeCourseReadRequest(tx,JSON.stringify(["sports-rule-row",storeId,sessionId]),()=>tx.$queryRaw<Array<{frequency:string;enrollment:string;planId:string|null;trialPrice:number;payload:SportsScheduleRule}>>`
    SELECT frequency,enrollment,"planId","trialPrice",payload FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} AND "sessionId"=${sessionId}
  `.then(rows=>rows[0]??null));
}
