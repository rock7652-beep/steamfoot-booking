import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  storeId:z.literal("store-course-start-0918-a"), bookingId:z.string().min(1),
  customerId:z.string().min(1), recipientHash:z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt:z.string().datetime(),
});
export type PreviewLineAcceptance = z.infer<typeof schema>;
const scope = new AsyncLocalStorage<PreviewLineAcceptance>();
export function readPreviewLineAcceptance(): PreviewLineAcceptance | null {
  if(process.env.VERCEL_ENV!=="preview" || process.env.VERCEL_GIT_COMMIT_REF!=="codex/course-scheduling-stage1") return null;
  const db=process.env.DATABASE_URL??"";
  if(!db.includes("ttworfzgwejdeolegkxl") || db.includes("qijlnhtpbintanzpxkvf")) return null;
  try { const grant=schema.parse(JSON.parse(process.env.COURSE_LINE_ACCEPTANCE_JSON??""));
    return Date.parse(grant.expiresAt)>Date.now()?grant:null;
  }catch{return null;}
}
export function withPreviewLineAcceptance<T>(grant:PreviewLineAcceptance,fn:()=>Promise<T>):Promise<T> {
  const configured=readPreviewLineAcceptance();
  if(!configured || JSON.stringify(configured)!==JSON.stringify(grant)) throw new Error("驗收授權不匹配");
  return scope.run(grant,fn);
}
export function currentPreviewLineAcceptance(){return scope.getStore();}
export function reminderRetryKey(id:string){
  const h=createHash("sha256").update(id).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function allowsPreviewLinePush(storeId:string|undefined,recipient:string,retryKey:string|undefined):boolean {
  const grant=scope.getStore(),configured=readPreviewLineAcceptance();
  return !!grant && !!configured && JSON.stringify(grant)===JSON.stringify(configured) && storeId===grant.storeId && createHash("sha256").update(recipient).digest("hex")===grant.recipientHash && !!retryKey && retryKey===scopeRetryKey.getStore();
}
const scopeRetryKey=new AsyncLocalStorage<string>();
export function withAcceptanceRetryKey<T>(key:string,fn:()=>Promise<T>){return scopeRetryKey.run(key,fn);}
