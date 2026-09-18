import type { Prisma } from "@prisma/client";
import { monthRange,toLocalMonthStr } from "@/lib/date-utils";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import { pushMessage,pushSteamButlerMessage,type LineMessage } from "@/lib/line";
import { resolveCentralLineRecipientForCustomer } from "./central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";

/** Shared channel, preview, quota and identity policy for course card notifications. Caller holds store lock. */
export async function deliverCourseCardNotification(tx:Prisma.TransactionClient,input:{
  id:string;storeId:string;person:{id:string;lineUserId:string|null;lineLinkStatus:string};messages:LineMessage[];retryKey:string;now:Date;
}) {
  const {id,storeId,person,messages,retryKey,now}=input;
  const skip=async(reason:string)=>{await tx.messageLog.update({where:{id},data:{status:"SKIPPED",errorMessage:reason}});return "SKIPPED" as const;};
  if(isPreviewExternalIntegrationBlocked()) return skip("隔離預覽未向外發送；不代表 LINE 送達");
  const range=monthRange(toLocalMonthStr(now));
  const count=await tx.messageLog.count({where:{storeId,status:"SENT",sentAt:{gte:range.start,lte:range.end}}});
  if(!checkReminderSendLimit(await getStoreForPlanByStoreId(storeId),count).allowed) return skip("已達本月提醒額度");
  const recipient=await resolveCentralLineRecipientForCustomer(person.id,storeId);
  const route=await resolveVerifiedReminderLineRoute(storeId,person.lineLinkStatus==="LINKED"?person.lineUserId:null,recipient,person.id);
  if(route.status==="BLOCKED") return skip(`LINE 身分未確認：${route.reason}`);
  const result=route.channel==="STORE"?await pushMessage(storeId,route.recipientLineUserId,messages,retryKey):await pushSteamButlerMessage(route.recipientLineUserId,messages,retryKey);
  await tx.messageLog.update({where:{id},data:{status:result.success?"SENT":"FAILED",lineRoute:route.channel,sentAt:result.success?now:null,errorMessage:result.success?null:result.error}});
  return result.success?"SENT" as const:"FAILED" as const;
}
