import { createHash } from "node:crypto";

export type NoticeRecord = {
 id:string; userId:string; customerId:string; recipientHash:string; channel:string; body:string;
 retryKey:string; status:string; firstAttemptAt:Date; leaseUntil:Date;
};
export type NoticeStatus = "READY"|"SENT"|"FAILED"|"BUSY"|"UNBOUND"|"BLOCKED";
export type NoticeSummary = {
 revision:number; reason:string|null; preview:boolean;
 rows:{staffId:string;name:string;status:NoticeStatus;reason:string}[];
};
export function notificationId(storeId:string,settlementId:string,staffId:string) {
 return 'course-monthly:'+createHash('sha256').update(JSON.stringify([storeId,settlementId,staffId])).digest('hex');
}
export function recipientHash(channel:string,recipient:string) {
 return createHash('sha256').update(JSON.stringify([channel,recipient])).digest('hex');
}
export function noticeRetryState(row:NoticeRecord|undefined,now:Date):NoticeStatus {
 if(!row)return 'READY';
 if(row.status==='SENT')return 'SENT';
 if(row.status==='BLOCKED')return 'BLOCKED';
 // LINE retry keys expire after 24 hours. Never risk a second delivery outside the window.
 if(now.getTime()-row.firstAttemptAt.getTime()>=23*60*60*1000)return 'BLOCKED';
 if(row.leaseUntil>now)return 'BUSY';
 return 'FAILED';
}
export function monthlyNotificationBody(storeName:string,month:string,url:string) {
 return `${storeName}\n${month} 收入明細已確認，可登入查看。\n此通知不代表款項已入帳。\n${url}`;
}
