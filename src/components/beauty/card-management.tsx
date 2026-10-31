"use client";
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import {saveBeautyCardManagement} from '@/server/actions/beauty-card-management';
import type {CourseCardView} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import type {PlanManagementInput} from '@/lib/plan-management';
import {saveBeautySessionAdjustment} from '@/server/actions/beauty-session-adjustment';
export function BeautyCardManagement({storeId,card,onSaved,onPending,onDirtyChange}:{storeId:string;card:CourseCardView;onSaved:()=>void;onPending:(pending:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const save=async(input:PlanManagementInput)=>{
  if(!input.expectedExpiresAt)return {success:false as const,error:'方案期限尚未確認，請先核對'};
  return saveBeautyCardManagement({...input,expectedExpiresAt:input.expectedExpiresAt});
 };
 return <PlanManagementControls storeId={storeId} card={card} unitLabel="次" save={save} sessionAdjustment={{save:saveBeautySessionAdjustment,records:card.sessionAdjustments??[],members:card.members}} onSaved={onSaved} onPending={onPending} onDirtyChange={onDirtyChange}/>;
}
