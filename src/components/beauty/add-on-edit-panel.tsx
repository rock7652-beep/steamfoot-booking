'use client';
import {useEffect,useRef,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {useRouter} from 'next/navigation';
import {readBeautyAddOns,updateBeautyAddOns} from '@/server/actions/beauty-add-ons';
import {BeautyAddOnChoices} from './add-on-fields';
import type {AddOnGroup} from '@/lib/beauty/add-ons';
export function BeautyAddOnEditPanel({id,storeId,onClose}:{id:string;storeId:string;onClose:()=>void}){
 const reader=usePanelReader('beauty-add-on-edit',readBeautyAddOns,storeId,0);
 const router=useRouter(),[data,setData]=useState<{revision:number;serviceName:string;groups:AddOnGroup[]}|null>(null),[ids,setIds]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[retry,setRetry]=useState(0),request=useRef(crypto.randomUUID());
 useEffect(()=>{let active=true;void reader.read({id,storeId}).then(r=>{if(!active)return;if(r.success&&r.data){setData(r.data);setIds(r.data.items.map(o=>o.id));}else setError('error' in r?String(r.error):'讀取失敗');}).catch(()=>{if(active)setError('讀取失敗，請重試');});return()=>{active=false;};},[id,storeId,retry,reader]);
 function close(){if(!busy&&(!dirty||window.confirm('尚有未儲存的修改，確定關閉？')))onClose();}
 async function save(){if(!data||busy)return;setBusy(true);setError('');try{const r=await updateBeautyAddOns({id,storeId,revision:data.revision,requestKey:request.current,ids});if(r.success){reader.clear();router.refresh();onClose();}else setError(r.error);}catch{setError('連線失敗，內容已保留，請重試');}finally{setBusy(false);}}
 return <section className="space-y-3 rounded-lg border border-earth-200 bg-white p-4" aria-label="修改附加項目"><h3 className="font-semibold">{data?.serviceName??'讀取中…'} · 附加項目</h3>{data&&<fieldset disabled={busy}><BeautyAddOnChoices groups={data.groups} selected={ids} onChange={next=>{setIds(next);setDirty(true);request.current=crypto.randomUUID();}}/></fieldset>}<p>附加項目抽成尚未計算；修改後將重新檢查金額與時段。</p>{error&&<p role="alert" className="text-red-700">{error}</p>}{!data&&error&&<button type="button" onClick={()=>{setError('');setRetry(n=>n+1);}}>重試</button>}<div className="flex gap-3"><button type="button" className="min-h-11 px-3" disabled={busy} onClick={close}>取消</button><button type="button" className="min-h-11 rounded-lg bg-primary-700 px-3 text-white" disabled={!data||busy||!dirty} onClick={save}>{busy?'儲存中…':'儲存'}</button></div></section>;
}
