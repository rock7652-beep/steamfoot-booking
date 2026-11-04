"use client";
import {useEffect,useState} from 'react';
import {DashboardLink} from '@/components/dashboard-link';
import {RightSheet} from '@/components/admin/right-sheet';
import {beautyOpeningSteps,beautyOpeningSetupComplete,beautySetupHref,type BeautySetupStepId,type BeautyOpeningStore} from '@/lib/beauty/opening-guide';
import {subscribeStoreProfileSaved} from '@/lib/store-profile-sync';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export function BeautyOpeningGuide({data,store}:{data:BeautyDashboardData;store?:BeautyOpeningStore}){
 const [open,setOpen]=useState(false);
 const [confirmed,setConfirmed]=useState<{storeId:string;source:BeautyOpeningStore|undefined;profile:BeautyOpeningStore}|null>(null);
 useEffect(()=>subscribeStoreProfileSaved(data.storeId,profile=>{setConfirmed({storeId:data.storeId,source:store,profile});setOpen(false);}),[data.storeId,store]);
 const profile=confirmed?.storeId===data.storeId&&confirmed.source===store?confirmed.profile:store;
 const input={services:data.services,technicians:data.techs,locations:data.locations,plans:data.plans,canReadPlans:data.access.planAccess,canReadTechnicians:data.access.staffAccess};
 if(beautyOpeningSetupComplete({...input,store:profile,hoursConfigured:data.openingHoursConfigured}))return null;
 const steps=beautyOpeningSteps(input).filter(step=>step.id!=='review');
 return <div className="flex justify-end"><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" onClick={()=>setOpen(true)}>開店設定引導</button>{open&&<RightSheet open presentation="centered" width={640} maxHeight={690} labelledById="beauty-opening-title" onClose={()=>setOpen(false)}>
  <header className="flex items-center justify-between border-b border-earth-200 px-4 py-2"><h2 id="beauty-opening-title" className="font-semibold">美業開店設定</h2><button type="button" className="min-h-11 px-3" onClick={()=>setOpen(false)}>關閉</button></header>
  <div className="min-h-0 overflow-auto px-4"><p className="py-2 text-sm text-earth-600">先完成開店所需的基本設定。設定齊全後，此引導會自動隱藏，日後直接到各設定頁修改。</p>
   <ol className="divide-y divide-earth-100">{steps.map((step,index)=><li key={step.id} className="flex gap-3 py-2"><span className="pt-2 text-sm text-earth-500">{index+1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{step.label}</strong><DashboardLink className="flex min-h-11 items-center text-sm text-primary-800" href={beautySetupHref(step.id as BeautySetupStepId)} onClick={()=>setOpen(false)}>前往設定</DashboardLink></div><p className="text-sm text-earth-600">{step.id==='charges'?'設定服務價格；有販售次數方案時再新增方案。':step.id==='staff'?'以目前店長帳號開始使用，有其他工作人員時再新增帳號與權限。':step.hint}</p></div></li>)}</ol>
  </div>
 </RightSheet>}</div>;
}
