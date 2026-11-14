"use client";

import type {CourseCustomerSource} from "./member-source";
import {useCardDetail} from "./use-card-detail";
import {CoursePlanUsageHistory} from "./plan-usage-history";
import {PlanManagementControls} from "@/components/admin/plan-management-controls";
import type {PlanGridAction} from "@/components/admin/plan-grid-actions";
import {saveCourseCardManagement} from "@/server/actions/course-card-management";
import {saveCourseSessionAdjustment} from "@/server/actions/course-session-adjustment";

/** A scoped full-card read inside the existing overview; original writes retain authoritative checks. */
export function InlineCustomerPlanManagement({cardId,customerId,action,storeId,revision,source,dataScope,music,canManage,onDirtyChange,onPending,onCancel,onSaved}:{
  cardId:string;customerId:string;action:PlanGridAction|"history";storeId:string;revision:number;source?:CourseCustomerSource;dataScope?:"operational"|"legacy";music:boolean;canManage:boolean;
  onDirtyChange:(dirty:boolean)=>void;onPending:(pending:boolean)=>void;onCancel:()=>void;onSaved:()=>void;
}) {
  const detail=useCardDetail(true,cardId,0,source?.browseCards??dataScope,false,undefined,{storeId,revision,preloadSource:source?.preloadCardDetails});
  if(detail.loading)return <p role="status">讀取方案資料中…</p>;
  if(detail.error||!detail.data)return <div role="alert">{detail.error??"找不到方案"}<button type="button" className="min-h-11 px-3" onClick={detail.retry}>重試</button><button type="button" className="min-h-11 px-3" onClick={onCancel}>取消</button></div>;
  const card=detail.data;
  if(action!=="history"&&(card.closed||card.openingImported||card.templateRestricted||!card.members.some(member=>member.id===customerId)))return <div role="alert">方案狀態已變更，目前無法修改<button type="button" className="min-h-11 px-3" onClick={onCancel}>取消</button></div>;
  const history=<CoursePlanUsageHistory card={card} customerId={customerId} music={music} source={source}/>;
  const callbacks={history,showActions:false,initialAction:action,onPending,onDirtyChange,onCancel,onSaved};
  if(source)return source.cardManagement?.(card,callbacks)??<PlanManagementControls {...callbacks} compactActions storeId={storeId} card={card} canManage={false} unitLabel={source.sessionUnitLabel??"堂"} save={async()=>({success:false,error:"沒有修改權限"})}/>;
  return <PlanManagementControls {...callbacks} compactActions storeId={storeId} card={card} canManage={canManage&&!card.closed&&!card.openingImported&&!card.templateRestricted} save={saveCourseCardManagement} unitLabel={card.unit==="SESSION"?"堂":"點"} sessionAdjustment={{save:saveCourseSessionAdjustment,records:card.sessionAdjustments??[],members:card.members}} expiryHint={music&&card.musicValidityDays?"儲存後以指定到期日為準；既有補課權益仍保留。":undefined}/>;
}
