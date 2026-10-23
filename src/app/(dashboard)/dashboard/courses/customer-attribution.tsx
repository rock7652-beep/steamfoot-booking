"use client";
import type {ComponentProps} from 'react';
import {CustomerAttributionForm} from '@/components/customer-attribution-form';
type Form=ComponentProps<typeof CustomerAttributionForm>;

/** The original customer workspace attribution section, including its edit flow. */
export function CourseCustomerAttribution({customerId,currentStaff,currentSponsor,staffOptions,canAssign,music=false,compact=false,editing,onToggle,onSaved,saveAction,searchAction}:{
 customerId:string;currentStaff:{id:string;displayName:string}|null;currentSponsor:Form['currentSponsor'];staffOptions:Form['staffOptions'];canAssign:boolean;music?:boolean;compact?:boolean;editing:boolean;onToggle:()=>void;onSaved:()=>void;saveAction?:Form['saveAction'];searchAction?:Form['searchAction'];
}){
 return <section aria-label="歸屬設定" className={compact?'py-1':'border-t border-earth-100 py-2'}>
  <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
   {!music&&<span>所屬店長：{currentStaff?.displayName??'未指派'}</span>}
   <span>推薦人：{currentSponsor?.name??'未設定'}</span>
   {canAssign&&<button type="button" className="min-h-11 px-3 text-primary-700" onClick={onToggle}>{editing?'取消修改':'修改歸屬'}</button>}
  </div>
  {editing&&<CustomerAttributionForm staffLabel="所屬店長" hideStaff={music} key={`attribution-${customerId}`} customerId={customerId} currentStaffId={currentStaff?.id??null} currentSponsor={currentSponsor} staffOptions={staffOptions} canAssign={canAssign} saveAction={saveAction} searchAction={searchAction} onSaved={onSaved}/>}
 </section>;
}
