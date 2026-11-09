/** Latest contains unread notices younger than 72h. Read notices enter history early. */
export const NOTICE_LATEST_MS=3*24*60*60*1000;
export const NOTICE_RETENTION_MS=10*24*60*60*1000;
export const NOTICE_RETENTION_TEXT='已讀或滿 3 天移至歷史訊息，訊息最多顯示 10 天。';
export function noticeWindow(history:boolean,now=new Date()) {
 const retainedAfter=new Date(now.getTime()-NOTICE_RETENTION_MS);
 const historicalThrough=new Date(now.getTime()-NOTICE_LATEST_MS);
 return {after:history?retainedAfter:historicalThrough,through:now,latestAfter:historicalThrough,retainedAfter,now};
}
export function noticeSection(publishedAt:Date,now=new Date(),readAt?:Date|string|null):'latest'|'history'|'expired' {
 const age=now.getTime()-publishedAt.getTime();
 return age<0||age>=NOTICE_RETENTION_MS?'expired':readAt!=null||age>=NOTICE_LATEST_MS?'history':'latest';
}
