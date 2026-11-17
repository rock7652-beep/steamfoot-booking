import { z } from "zod";
import { parseTaipeiDateTime } from "@/lib/date-utils";

export const CUSTOMER_MESSAGE_LIMIT = 500;
export const CUSTOMER_MESSAGE_MAX_LENGTH = 2000;
export const messageFiltersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  stage: z.enum(["", "LEAD", "TRIAL", "ACTIVE", "INACTIVE"]).default(""),
  line: z.enum(["", "LINKED", "UNLINKED", "BLOCKED"]).default(""),
  labelId: z.string().max(100).default(""),
  staffId: z.string().max(100).default(""),
});
export const messageDraftSchema = z.object({
  customerIds: z.array(z.string().min(1).max(100)).min(1).max(CUSTOMER_MESSAGE_LIMIT)
    .transform(ids => [...new Set(ids)].sort()),
  body: z.string().trim().min(1, "請輸入訊息內容").max(CUSTOMER_MESSAGE_MAX_LENGTH, "訊息最多 2,000 字"),
  timing: z.enum(["now", "scheduled"]),
  date: z.string().default(""), time: z.string().default(""),
});
export type MessageFilters = z.infer<typeof messageFiltersSchema>;
export type MessageDraft = z.input<typeof messageDraftSchema>;
export type MessagePerson = {id:string;name:string;phone:string;lineStatus:string;stage:string};
export type MessageHistory = {id:string;body:string;status:string;scheduledAt:string;createdAt:string;total:number;accepted:number;pending:number;failed:number;skipped:number;unknown:number};
export type MessagePreview = {id:string;body:string;scheduledAt:string;immediate:boolean;expiresAt:string;ready:Array<{id:string;name:string}>;excluded:Array<{id:string;name:string;reason:string}>;blocker:string|null;quota:{used:number;limit:number|null}|null};
export type MessageOptions = {storeId:string;storeName:string;labels:Array<{id:string;name:string}>;staff:Array<{id:string;name:string}>;blocker:string|null};
export type MessageResult<T> = {success:true;data:T}|{success:false;error:string};

export function messageSchedule(input: Pick<MessageDraft,"timing"|"date"|"time">, now = new Date()): Date {
  if(input.timing === "now") return now;
  const date = parseTaipeiDateTime(input.date ?? "", input.time ?? "");
  if(!date || date.getTime() <= now.getTime()) throw new Error("請選擇未來的發送日期與時間（台灣時間）");
  if(date.getTime() > now.getTime()+90*86400000) throw new Error("發送日期請選擇未來 90 天內");
  return date;
}
export function messageRetryAllowed(firstAttemptAt: Date|null, attempts:number, now = new Date()) {
  return attempts < 5 && (!firstAttemptAt || now.getTime()-firstAttemptAt.getTime() < 23*3600000);
}
export const messageStatusText:Record<string,string> = {DRAFT:"待確認",QUEUED:"等待發送",CANCELLED:"已取消",COMPLETED:"處理完成",PARTIAL:"部分未發送"};
export function messageDateLabel(value:string) {
  return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));
}
