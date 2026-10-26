import type {LineMessage} from '@/lib/line';
import {LINE_CARD_COLORS as colors,LINE_CARD_STYLES as styles} from '@/lib/line-card-theme';

/** Presentation only. Recipient, store authorization and retries stay in the worker. */
export function beautyNotificationMessages(input:{kind:string;body:string;storeName:string;customerName?:string;serviceName?:string;time?:string;memberUrl?:string;contactUrl?:string}):LineMessage[]{
 const title:Record<string,string>={BOOKED:'預約成立',MOVED:'預約改期',REMINDER:'明日服務提醒',RESERVED:'預約確認',CANCELLED:'預約取消',COMPLETED:'服務完成',NO_SHOW:'未到店通知'};
 const heading=title[input.kind]??'預約通知';
 const actions=[input.memberUrl?{label:'查看預約',uri:input.memberUrl}:null,input.contactUrl?{label:'聯繫店家',uri:input.contactUrl}:null].filter((a):a is {label:string;uri:string}=>!!a&&/^https:\/\//.test(a.uri));
 const lines=[input.customerName,input.serviceName,input.time].filter((s):s is string=>!!s);
 return [{type:'flex',altText:`${input.storeName}｜${heading}｜${input.serviceName??input.body}`.slice(0,400),contents:{type:'bubble',styles,
  header:{type:'box',layout:'vertical',backgroundColor:colors.headerBackground,contents:[{type:'text',text:heading,color:colors.headerText,weight:'bold',size:'xl',wrap:true},{type:'text',text:input.storeName,color:colors.headerSubtext,size:'sm',wrap:true}]},
  body:{type:'box',layout:'vertical',spacing:'md',contents:(lines.length?lines:[input.body]).map(text=>({type:'text',text:text.slice(0,2000)||'預約通知',color:colors.text,wrap:true,size:'md'}))},
  ...(actions.length?{footer:{type:'box',layout:'vertical',spacing:'sm',contents:actions.map(action=>({type:'button',style:'link',color:colors.primary,action:{type:'uri',...action}}))}}:{}),
 }}];
}
