import { formatTWDateTime } from './date-utils';
import type { LineFlexMessage } from './line';
export const COACH_NOTICE_KINDS = ['DIGEST','CHANGE','TRIAL'] as const;
export type CoachNoticeKind = typeof COACH_NOTICE_KINDS[number];
export const COACH_NOTICE_LABELS:Record<CoachNoticeKind,string>={DIGEST:'明日授課摘要',CHANGE:'課程異動',TRIAL:'體驗學員通知'};
export function coachNoticeSettingId(storeId:string,kind:CoachNoticeKind){return `course-coach-${kind.toLowerCase()}:${storeId}`;}
export type CoachNoticeLine={name:string;startsAt:string;endsAt:string;room:string;color:string;detail:string;previous?:string};
export function coachNoticeFlex(kind:CoachNoticeKind,store:string,lines:CoachNoticeLine[],url:string,date?:string):LineFlexMessage {
 const text=(value:string,color='#36584B',weight='regular')=>({type:'text',text:value||'—',size:'sm',color,weight,wrap:true});
 return {type:'flex',altText:`${COACH_NOTICE_LABELS[kind]} · ${lines.length} 筆`,contents:{type:'bubble',size:'mega',body:{type:'box',layout:'vertical',spacing:'md',contents:[text(store,'#777268'),text(COACH_NOTICE_LABELS[kind],'#36584B','bold'),...(date?[text(date)]:[]),...lines.slice(0,8).map(line=>({type:'box',layout:'vertical',spacing:'xs',contents:[{type:'box',layout:'horizontal',spacing:'sm',contents:[{type:'text',text:'●',color:line.color,size:'sm',flex:0},text(line.name,'#36584B','bold')]},text(`${formatTWDateTime(new Date(line.startsAt))}–${formatTWDateTime(new Date(line.endsAt)).slice(11)} · ${line.room}`,'#777268'),...(line.previous?[text(line.previous,'#777268')]:[]),text(line.detail)]})),...(lines.length>8?[text(`另 ${lines.length-8} 筆，點下方查看`)]:[])]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'primary',color:'#45685A',action:{type:'uri',label:'查看授課名單',uri:url}}]}}};
}
