import {courseCardStartIssue} from "./course-card-start";
import {toLocalDateStr} from "./date-utils";

type ScheduleCard={startRequired?:boolean;startsAt?:string|null;expiresAt?:string|null;expired?:boolean;subjectMatches?:boolean;unavailableReason?:string|null;available:number;remaining?:number;held?:number;unit:string};
/** One reason drives the label, inline explanation, auto-selection and form validity. */
export function courseCardScheduleIssue(card:ScheduleCard,at:Date|null,required:number):{label:string;message:string}|null {
  if(card.subjectMatches===false)return {label:"科目不符",message:"科目不符：此課卡不適用所選科目，請改選課程或使用對應課卡"};
  const start=courseCardStartIssue(!!card.startRequired,card.startsAt,at);
  if(start)return {label:"尚未開始",message:start};
  if(card.expired||at&&card.expiresAt&&new Date(card.expiresAt)<at)return {label:"已過期",message:`課卡已過期或不涵蓋上課時間：有效至 ${card.expiresAt?toLocalDateStr(new Date(card.expiresAt)):"未確認"}，請調整日期或改選其他課卡`};
  if(card.unavailableReason)return {label:"待核對",message:card.unavailableReason};
  if(card.available<required){const unit=card.unit==="SESSION"?"堂":"點";return {label:card.unit==="SESSION"?"堂數不足":"點數不足",message:`${card.unit==="SESSION"?"堂數":"點數"}不足：可用 ${card.available} ${unit}，本次需 ${required} ${unit}${card.held?`（已預約占用 ${card.held} ${unit}）`:""}，請補購或改選其他課卡`};}
  return null;
}
