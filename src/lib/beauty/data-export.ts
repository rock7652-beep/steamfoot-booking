import {COURSE_EXPORT_LABELS,COURSE_EXPORT_PERIOD_LABELS,COURSE_EXPORT_STATUSES} from '@/lib/course-data-export';
import type {DataExportType} from '@/lib/data-export-labels';
export const BEAUTY_EXPORT_LABELS={...COURSE_EXPORT_LABELS,transactions:'服務收款、方案與退款',bookings:'服務預約與完成',wallets:'服務方案與次數'};
export const BEAUTY_EXPORT_PERIOD_LABELS={...COURSE_EXPORT_PERIOD_LABELS,transactions:'收款／退款及購買申請期間（分頁列示）',bookings:'服務日期期間'};
export const BEAUTY_EXPORT_STATUSES={...COURSE_EXPORT_STATUSES,transactions:[{value:'PENDING',label:'待確認'},{value:'CONFIRMED',label:'已收款'},{value:'REFUNDED',label:'已退款'},{value:'VOIDED',label:'已作廢'}],bookings:[{value:'RESERVED',label:'待服務'},{value:'COMPLETED',label:'已完成'},{value:'NO_SHOW',label:'未到'},{value:'CANCELLED',label:'已取消'}]};
export function beautyExportStatusLabel(type:DataExportType,status:string){return BEAUTY_EXPORT_STATUSES[type].find(option=>option.value===status)?.label??'需核對';}
