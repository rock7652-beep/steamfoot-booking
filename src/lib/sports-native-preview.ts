import "server-only";
import { sportsProductionStore } from "./sports-production-store";
import { sportsStagingEnabled } from "./sports-staging";
import {memoizeReadRequest} from "@/server/services/read-request-memo";
/** Production sports stores always use native workflows; isolated QA stays scoped. */
export async function sportsNativePreview(storeId?: string) {
  return memoizeReadRequest(JSON.stringify(["sports.native.eligibility",storeId]),()=>readSportsNative(storeId));
}
async function readSportsNative(storeId?:string){
  if (process.env.VERCEL_ENV === "production") return sportsProductionStore(storeId);
  return process.env.VERCEL_ENV === "preview" && storeId === "sports-live-flow-store" && await sportsStagingEnabled(storeId);
}
