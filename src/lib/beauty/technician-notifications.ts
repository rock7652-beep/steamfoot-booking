import { formatTWDateTime } from '@/lib/date-utils';
import type { LineFlexMessage } from '@/lib/line';
export const TECHNICIAN_NOTICE_KINDS = ['TECH_DIGEST','TECH_CHANGE'] as const;
export type TechnicianNoticeKind = typeof TECHNICIAN_NOTICE_KINDS[number];
export const TECHNICIAN_NOTICE_LABELS:Record<TechnicianNoticeKind,string>={TECH_DIGEST:'技師明日班表',TECH_CHANGE:'技師預約異動'};
export const technicianNoticeSettingId=(storeId:string,kind:TechnicianNoticeKind)=>`beauty-technician-${kind}:${storeId}`;
export type TechnicianNoticeBody={technicianId:string;date?:string;action?:string;startsAt?:string;previousStartsAt?:string;recipient?:string;snapshot?:string;message?:LineFlexMessage};
export function technicianNoticeMessage(storeName:string,kind:TechnicianNoticeKind,lines:{name:string;service:string;startsAt:Date;endsAt:Date;location:string}[],url:string,action?:string):LineFlexMessage {
 const text=(value:string)=>({type:'text',text:value,wrap:true,size:'sm',color:'#36584B'});
 return {type:'flex',altText:`${storeName}｜${TECHNICIAN_NOTICE_LABELS[kind]}`,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents:[text(storeName),{...text(TECHNICIAN_NOTICE_LABELS[kind]),weight:'bold'},...(action?[text(action)]:[]),...lines.slice(0,8).map(b=>({type:'box',layout:'vertical',spacing:'xs',contents:[text(`${formatTWDateTime(b.startsAt)}–${formatTWDateTime(b.endsAt).slice(11)}`),text(`${b.name}｜${b.service}｜${b.location}`)]})),...(lines.length>8?[text(`另 ${lines.length-8} 筆，請查看班表`)]:[])]},footer:{type:'box',layout:'vertical',contents:[{type:'button',action:{type:'uri',label:'查看我的班表',uri:url}}]}}};
}
