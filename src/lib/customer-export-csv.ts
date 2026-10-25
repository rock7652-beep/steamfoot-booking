import {courseCardCoversDate,courseCardHasVerifiedNoExpiry} from './course-card-expiry';
import {toLocalDateStr} from './date-utils';
export type CustomerExportRow={id:string;name:string;phone:string;email?:string|null;lineName?:string|null;customerStage:string;address?:string|null;notes?:string|null;emergencyContactName?:string|null;emergencyContactPhone?:string|null;createdAt:Date;assignedStaff?:{storeId:string;displayName:string}|null};
export type CustomerExportCard={nameSnapshot:string;unit:string;remaining:number;expiresAt:Date|null;id?:string;storeId?:string;musicOpeningStateRequired?:boolean;musicOpeningState?:unknown;musicActivatedAt?:Date|null;musicValidityDays?:number|null;members:{customerId:string}[];bookings:{pointCost:number}[]};
export type CustomerExportAttendance={customerId:string;participations:bigint;completed:bigint;lastVisitAt:Date|null};
/** The same authorized export projections use one CSV table and formula escaping. */
export function customerExportCsv(storeId:string,access:{cards:boolean;bookings:boolean},customers:CustomerExportRow[],cards:CustomerExportCard[],classes:CustomerExportAttendance[],service=false){
  const now = new Date();
  const stages:Record<string,string>={LEAD:"名單",TRIAL:"體驗",ACTIVE:"已購課",INACTIVE:"已停用"};
  const rows: Array<Array<string|number>> = [["姓名","電話","Email","LINE名稱","狀態","所屬店長","地址","緊急聯絡人","緊急聯絡電話","一般備註","方案（逐卡：剩餘／占用／可用／到期）",...(service?[]:["可用點數（共卡不可跨人加總）"]),service?"可用次數（共卡不可跨人加總）":"可用堂數（共卡不可跨人加總）","未取消預約人次",service?"完成服務人次":"完成出席人次",service?"最近服務":"最近上課","建立日期"]];
  for (const c of customers) {
    const memberCards = cards.filter(card=>card.members.some(m=>m.customerId===c.id));
    const balances = memberCards.map(card=>{
      const held=card.bookings.reduce((sum,b)=>sum+b.pointCost,0);
      return {...card,held,available:!courseCardCoversDate(card,storeId,now)?0:Math.max(0,card.remaining-held)};
    });
    const attendance=classes.find(row=>row.customerId===c.id);
    const unread="無檢視權限";
    rows.push([
      c.name,c.phone,c.email??"",c.lineName??"",stages[c.customerStage]??c.customerStage,
      c.assignedStaff?.storeId===storeId?c.assignedStaff.displayName:"未指派",c.address??"",c.emergencyContactName??"",c.emergencyContactPhone??"",c.notes??"",
      access.cards?balances.map(card=>`${card.nameSnapshot}${card.members.length>1?"（共卡）":""}：剩餘${card.remaining}／占用${card.held}／可用${card.available}${card.unit==="SESSION"?(service?"次":"堂"):"點"}／${card.expiresAt?toLocalDateStr(card.expiresAt):courseCardHasVerifiedNoExpiry(card,storeId)?"無期限":"效期待核對"}${card.expiresAt&&card.expiresAt<now?"（已到期）":""}`).join("；"):unread,
      ...(service?[]:[access.cards?balances.filter(card=>card.unit==="POINT").reduce((sum,card)=>sum+card.available,0):unread]),
      access.cards?balances.filter(card=>card.unit==="SESSION").reduce((sum,card)=>sum+card.available,0):unread,
      access.bookings?String(attendance?.participations??0):unread,access.bookings?String(attendance?.completed??0):unread,
      access.bookings?(attendance?.lastVisitAt?toLocalDateStr(attendance.lastVisitAt):""):unread,toLocalDateStr(c.createdAt),
    ]);
  }
  return "\uFEFF"+rows.map(row=>row.map(value=>{
    const text=String(value);
    const safe=typeof value==="string"&&/^[=+@\-\t\r]/.test(text)?"'"+text:text;
    return `"${safe.replaceAll('"','""')}"`;
  }).join(",")).join("\r\n");
}
