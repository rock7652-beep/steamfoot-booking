/** Absolute elapsed time: 72 hours in latest, then 168 hours in history. */
export const NOTICE_LATEST_MS=3*24*60*60*1000;
export const NOTICE_RETENTION_MS=10*24*60*60*1000;
export const NOTICE_RETENTION_TEXT='最新消息保留 3 天，之後移至歷史訊息，再顯示 7 天。';
export function noticeWindow(history:boolean,now=new Date()) {
 const retainedAfter=new Date(now.getTime()-NOTICE_RETENTION_MS);
 const historicalThrough=new Date(now.getTime()-NOTICE_LATEST_MS);
 return {after:history?retainedAfter:historicalThrough,through:history?historicalThrough:now,retainedAfter,now};
}
export function noticeSection(publishedAt:Date,now=new Date()):'latest'|'history'|'expired' {
 const age=now.getTime()-publishedAt.getTime();
 return age<0||age>=NOTICE_RETENTION_MS?'expired':age>=NOTICE_LATEST_MS?'history':'latest';
}
