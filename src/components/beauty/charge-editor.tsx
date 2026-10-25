"use client";
import {z} from 'zod';
import {useRef,useState} from 'react';
import {RightSheet} from '@/components/admin/right-sheet';
import {CoursePlanDraftForm,type CoursePlanCatalogPort,type Plan} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import {savedCoursePlan} from '@/lib/course-plan-save';
import {validateBeautyCharge,assertChargePersistence,type BeautyChargeDraft,type ChargeService,type ChargeTechnician} from '@/lib/beauty/charge-editor';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export type BeautyChargePort={perChargeTechnicians:boolean;save:(draft:BeautyChargeDraft)=>Promise<{success:boolean;error?:string;syncWarning?:boolean}>};
/** Beauty supplies only business fields and a writer. The original course fee form owns every input and its save lifecycle. */
export function BeautyChargeEditor({storeId,services,technicians,onClose,onSaved,port,initialServiceId,initialKind='single',initialDraft}:{storeId:string;services:ChargeService[];technicians:ChargeTechnician[];onClose:()=>void;onSaved?:()=>void;port?:BeautyChargePort;initialServiceId?:string;initialKind?:'single'|'plan';initialDraft?:BeautyChargeDraft}){
 const [kind,setKind]=useState(initialDraft?.kind??initialKind),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false);
 const busy=useRef(false);const serviceId=initialDraft?.serviceId??initialServiceId??services.find(s=>s.active)?.id??'';
 const close=()=>{if(!busy.current&&!uncertain)onClose();};
 const catalog:CoursePlanCatalogPort={compact:true,confirmDiscard:false,units:['SESSION'],sportsModes:['ASSIGNED'],sessionLabel:'次數',rowSchema:savedCoursePlan.extend({name:z.string().trim().min(1).max(100)}),
  charge:{trialStoreCost:initialDraft?.kind==='single'?initialDraft.trialStoreCost??null:null,storeCost:initialDraft?.storeCost??null,kind,locked:!!initialDraft,onKindChange:setKind,serviceId,name:initialDraft?.name??'',price:initialDraft?.price??null,sessions:initialDraft?.kind==='plan'?initialDraft.sessions:null,validDays:initialDraft?.kind==='plan'?initialDraft.validDays:90,allowShared:initialDraft?.kind==='plan'&&initialDraft.allowShared,technicianIds:initialDraft?.technicianIds??[],trialPrice:initialDraft?.kind==='single'?initialDraft.trialPrice:null,trialDuration:initialDraft?.kind==='single'?initialDraft.trialMinutes:null,technicians},
  transport:async input=>{
   let checked:ReturnType<typeof validateBeautyCharge>;try{checked=validateBeautyCharge({expectedStoreId:storeId,kind:input.chargeKind,storeCost:input.storeCost,serviceId:input.subjectId,name:input.name,price:input.price,technicianIds:input.coachIds,...(input.chargeKind==='single'?{sessions:1,trialStoreCost:input.trialStoreCost,trialPrice:input.trialPrice,trialMinutes:input.trialDuration}:{sessions:input.points,validDays:input.validDays,allowShared:input.allowShared})},storeId,services,technicians);}catch(error){return {success:false,error:error instanceof z.ZodError?error.issues.map(issue=>issue.message).join('；'):error instanceof Error?error.message:'請核對收費設定'};}
   if(!port)return {success:false,error:`${checked.draft.name}／${checked.draft.sessions} 次／價格 $${checked.amount}${checked.trial?`／體驗 $${checked.trial.price}・${checked.trial.duration} 分鐘`:''}。僅核對，未儲存。`};
   try{assertChargePersistence(port);}catch{return {success:false,error:'方案專屬技師限制尚未接通，設定未儲存'};}
   const result=await port.save(checked.draft);if(!result.success)return result;
   const row:Plan={lowBalanceEnabled:false,lowBalanceThreshold:null,id:initialDraft?'charge:'+initialDraft.serviceId:'charge:new',name:checked.draft.name,points:checked.draft.sessions,price:checked.draft.price,validDays:checked.draft.kind==='plan'?checked.draft.validDays:90,isActive:true,unit:'SESSION',templateIds:[checked.draft.serviceId],allowShared:checked.draft.kind==='plan'&&checked.draft.allowShared};
   return {success:true,storeId,data:row,syncWarning:result.syncWarning};
  },save:async()=>({success:false,error:'請使用已確認的收費儲存接點'}),
 };
 return <RightSheet open presentation="centered" className="fitness-management-editor" fitContent width={920} maxHeight={680} onClose={close} closeOnEscape={!pending&&!uncertain} labelledById="beauty-charge-title">
  <header className="flex shrink-0 items-center justify-between border-b border-earth-100 bg-primary-50/60 px-4 py-2"><h2 id="beauty-charge-title" className="text-base font-semibold">{initialDraft?'編輯收費方式':'新增收費方式'}</h2><button className={button} disabled={pending||uncertain} onClick={close}>關閉</button></header>
  <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"><CoursePlanDraftForm key={kind+':'+serviceId} catalog={catalog} subjectLabel="服務項目" sportsData={{storeId,date:'',subjects:[],fees:[],lessons:[],students:[],customers:[],coaches:[],rooms:[]}} storeId={storeId} plan={null} subjects={services.map(s=>({id:s.id,name:s.name,category:'',isActive:s.active}))} templates={services.map(s=>({id:s.id,name:s.name,category:'',isActive:s.active,durationMinutes:s.duration}))} termSessions={[]} profitEnabled={false} onPending={value=>{busy.current=value;setPending(value);}} onUncertain={setUncertain} onSaved={(_row,warning)=>{onSaved?.();if(!warning)onClose();}}/></div>
  <footer className="shrink-0 border-t border-earth-100 bg-white px-4 py-3"><div className="flex justify-end gap-2"><button type="button" className={button} disabled={pending||uncertain} onClick={close}>取消</button><button form="course-member-form" type="submit" className={button+' bg-primary-700 text-white'} disabled={pending}>{pending?'儲存中…':uncertain?'重試確認儲存結果':port?'儲存':'核對設定'}</button></div></footer>
 </RightSheet>;
}
