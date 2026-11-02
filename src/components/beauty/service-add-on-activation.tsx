'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useFeaturePresentation} from '@/components/feature-presentation';
import {FEATURES} from '@/lib/feature-flags';
import {saveBeautyServiceAddOnActivation} from '@/server/actions/beauty-service-add-on-activation';
export function BeautyServiceAddOnActivation({storeId,enabled,revision,canManage}:{storeId:string;enabled:boolean;revision:number;canManage:boolean}){
 const state=useFeaturePresentation(FEATURES.BEAUTY_SERVICE_ADD_ONS),router=useRouter();
 const [current,setCurrent]=useState({enabled,revision}),[error,setError]=useState(''),[pending,start]=useTransition();
 if(state==='HIDDEN')return null;
 return <div className="mb-4 rounded-xl border border-earth-200 bg-white px-4 py-3"><div className="flex min-h-11 flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><span className="font-medium text-earth-900">加做服務</span><span className="text-earth-600">{state==='LOCKED'?'尚未開通':current.enabled?'已啟用':'已關閉'}</span></div>{state==='ENABLED'&&canManage&&<button type="button" disabled={pending} className="min-h-11 rounded-lg border border-earth-200 px-4 text-primary-800 disabled:opacity-50" onClick={()=>start(async()=>{setError('');const r=await saveBeautyServiceAddOnActivation({storeId,revision:current.revision,enabled:!current.enabled});if(r.success&&'data' in r){setCurrent(r.data);router.refresh();}else setError('error' in r?r.error:'設定未儲存');})}>{pending?'儲存中…':current.enabled?'關閉':'啟用'}</button>}</div>{error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}</div>;
}
