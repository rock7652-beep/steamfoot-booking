import "server-only";
import {customerOverviewPreviewStore,courseSubjectSportsPreview} from "../../scripts/compact-operations-preview-scope.mjs";
import { sportsProductionStore } from "./sports-production-store";
import { sportsStagingEnabled } from "./sports-staging";
import {memoizeReadRequest} from "@/server/services/read-request-memo";
import {assertSportsLiveFlowQaEnvironment} from "../../scripts/sports-live-flow-qa-scope.mjs";
/** Production sports stores always use native workflows; isolated QA stays scoped. */
export async function sportsNativePreview(storeId?: string) {
  return memoizeReadRequest(JSON.stringify(["sports.native.eligibility",storeId]),()=>readSportsNative(storeId));
}
async function readSportsNative(storeId?:string){
  if(courseSubjectSportsPreview(storeId)||customerOverviewPreviewStore("sports",storeId))return true;
  if(process.env.SPORTS_LIVE_FLOW_QA==='1'){
    assertSportsLiveFlowQaEnvironment(process.env);
    return storeId==='sports-live-flow-store'&&await sportsStagingEnabled(storeId);
  }
  if (process.env.VERCEL_ENV === "production") return sportsProductionStore(storeId);
  return process.env.VERCEL_ENV === "preview" && storeId === "sports-live-flow-store" && await sportsStagingEnabled(storeId);
}
