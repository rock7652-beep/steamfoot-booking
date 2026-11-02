'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AddOnFields} from './fields';
import type {saveSteamfootAddOnCatalog} from '@/server/actions/steamfoot-add-ons';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import {useCourseDraftGuard} from '@/components/admin/use-course-draft-guard';
import type {AddOnGroup,AddOnModule} from '@/lib/add-ons';
export function AddOnCatalog({storeId,revision,groups,enabled=false,module,subjects,sharedOnly=false,activationOnly=false,save}:{storeId:string;revision:number;subjects?:import('@/lib/add-ons').AddOnTeachingSubject[];enabled?:boolean;groups:AddOnGroup[];module:AddOnModule;sharedOnly?:boolean;activationOnly?:boolean;save:typeof saveSteamfootAddOnCatalog}){
 const [reset,setReset]=useState(0);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),request=useRef(crypto.randomUUID()),router=useRouter();
 useCourseDraftGuard(dirty,busy);
 useSettingsPanelGuard(dirty,busy);
 return <form className="space-y-4" onChange={()=>{setDirty(true);request.current=crypto.randomUUID();}} onSubmit={async e=>{e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError('');setMessage('');try{const result=await save({storeId,revision,requestKey:request.current,enabled:form.get('enabled')==='on',groups:JSON.parse(String(form.get('addOnGroups')??'[]'))});if(result.success){setDirty(false);setMessage('已儲存 ✓');router.refresh();}else setError(result.error);}catch{setError('連線失敗，設定已保留，請重試');}finally{setBusy(false);}}}>
 <fieldset key={'catalog-'+reset} disabled={busy} className="space-y-4"><label className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3"><span className="font-medium text-earth-900">{module==='BEAUTY'&&sharedOnly?'啟用加購商品':'啟用附加項目'}</span><input type="checkbox" name="enabled" defaultChecked={enabled} className="h-5 w-5 accent-primary-700"/><span className="w-full text-sm text-earth-500">關閉後停止新增選購，既有預約與收退款保留。</span></label><div hidden={activationOnly}><AddOnFields key={reset} module={module} sharedOnly={sharedOnly} imageBasePath="/api/add-ons/images" storeId={storeId} subjects={subjects} initial={groups} onDirty={()=>{setDirty(true);request.current=crypto.randomUUID();}}/></div>{(activationOnly||sharedOnly)&&<p className="text-earth-600">各服務的加做項目，請至<a className="ml-1 text-primary-800 underline" href="/dashboard/beauty?tab=服務項目">服務項目</a>設定。</p>}</fieldset>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3"><span role="status" className="text-sm text-earth-500">{busy?'儲存中…':dirty?'未儲存':message}</span><div className="flex gap-2">{dirty&&<button type="button" className="min-h-11 rounded-lg border border-earth-200 px-4 text-earth-700" disabled={busy} onClick={()=>{setReset(n=>n+1);setDirty(false);setError('');setMessage('');request.current=crypto.randomUUID();}}>取消</button>}<button className="min-h-11 rounded-lg bg-primary-700 px-5 text-white disabled:opacity-50" disabled={busy||!dirty}>{busy?'儲存中…':'儲存'}</button></div></div><details><summary className="min-h-11 cursor-pointer py-3 text-earth-500">設定說明</summary><p className="text-sm leading-relaxed text-earth-600">{module==='BEAUTY'&&!sharedOnly?'美業加做可依品項增加金額與時間；抽成尚未計算。':'金額可設為 0 元；附加項目不增加預約時間、不影響名額與方案堂數。附加項目抽成尚未計算。'}</p></details>
 </form>;
}
