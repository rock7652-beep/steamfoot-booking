import "server-only";
import type {Prisma} from "../../../generated/course-client";
import type {SportsScheduleRule} from "@/lib/sports-staging-types";
import {memoizeCourseReadRequest} from "./course-read-request-memo";

/** Store-scoped persisted evidence, not a substitute for readiness or grants. */
export function readSportsSessionRuleRow(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string,sessionId:string){
  return memoizeCourseReadRequest(tx,JSON.stringify(["sports-rule-row",storeId,sessionId]),()=>tx.$queryRaw<Array<{frequency:string;enrollment:string;planId:string|null;trialPrice:number;payload:SportsScheduleRule}>>`
    SELECT frequency,enrollment,"planId","trialPrice",payload FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} AND "sessionId"=${sessionId}
  `.then(rows=>rows[0]??null));
}
