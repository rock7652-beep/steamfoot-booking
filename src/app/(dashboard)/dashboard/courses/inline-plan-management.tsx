"use client";
import { PlanManagementControls } from "@/components/admin/plan-management-controls";
import type { PlanGridAction } from "@/components/admin/plan-grid-actions";
import { saveCourseCardManagement } from "@/server/actions/course-card-management";
import { saveCourseSessionAdjustment } from "@/server/actions/course-session-adjustment";
import { useCardDetail } from "./use-card-detail";

export function CourseInlinePlanManagement({storeId,customerId,cardId,action,dataScope,revision,music,onDirtyChange,onPending,onSaved,onCancel}:{
 storeId:string;customerId:string;cardId:string;action:PlanGridAction;dataScope?:"operational"|"legacy";revision:number;music:boolean;
 onDirtyChange:(dirty:boolean)=>void;onPending:(pending:boolean)=>void;onSaved:()=>void;onCancel:()=>void;
}){
 const detail=useCardDetail(true,cardId,revision,dataScope,true),card=detail.data;
 const belongs=card?.members.some(member=>member.id===customerId);
 const blocked=card&&(card.id!==cardId||!belongs||card.closed||card.openingImported||card.templateRestricted);
 return <div aria-label="同頁方案操作" className="min-w-0" aria-busy={detail.loading}>
  {detail.loading?<p role="status" className="py-2 text-sm">讀取方案資料中…</p>:detail.error?<p role="alert" className="py-2 text-sm text-red-700">{detail.error}<button type="button" className="ml-2 min-h-11 underline" onClick={detail.retry}>重試</button></p>:blocked?<p role="alert" className="py-2 text-sm">方案狀態已變更，請重新核對；來源方案或補課權益須由原專用流程處理。</p>:card?<PlanManagementControls key={`${card.id}:${revision}`} storeId={storeId} card={card} save={saveCourseCardManagement} initialAction={action} showActions={false} sessionAdjustment={{save:saveCourseSessionAdjustment,records:card.sessionAdjustments??[],members:card.members}} unitLabel={card.unit==='SESSION'?'堂':'點'} expiryHint={music&&card.musicValidityDays?'儲存後以指定到期日為準，首次上課與恢復點名不再重算本方案期限；既有補課權益仍保留。':undefined} onDirtyChange={onDirtyChange} onPending={onPending} onSaved={onSaved} onCancel={onCancel}/>:null}
  {(detail.loading||detail.error||blocked)&&<button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" onClick={onCancel}>取消</button>}
 </div>;
}
