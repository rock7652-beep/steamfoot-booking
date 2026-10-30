'use client';
import {useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {StoreNoticeBell} from './store-notice-bell';
import {markBeautyStoreNotice,loadBeautyStoreNoticeTarget} from '@/server/actions/beauty-store-notices';
import type {StoreNoticeLoadResult} from '@/lib/store-notices';

// Background reads must not queue financial Server Actions in the same tab.
async function readBeautyStoreNotices(input:{storeId:string;handled:boolean;offset:number;summaryOnly?:boolean}):Promise<StoreNoticeLoadResult>{
 const response=await fetch('/api/beauty/store-notices/read',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const result:unknown=await response.json();
 if(!result||typeof result!=='object'||!('success' in result)||typeof result.success!=='boolean'||(!response.ok&&result.success))throw new Error('通知讀取失敗');
 return result as StoreNoticeLoadResult;
}
export function BeautyStoreNoticeBell({storeId,initialEnabled=false}:{storeId:string;initialEnabled?:boolean}){
 const router=useRouter(),path=usePathname(),[opening,setOpening]=useState(false);
 return <StoreNoticeBell namespace="beauty" storeId={storeId} initialEnabled={initialEnabled} loadNotices={readBeautyStoreNotices} markNotice={markBeautyStoreNotice} targetLabel={opening?'讀取預約中…':'查看預約'} closeOnViewTarget onViewTarget={async n=>{
  if(n.kind==='PAYMENT'){const prefix=(path??'').split('/dashboard')[0];router.push(`${prefix}/dashboard/beauty?${new URLSearchParams({tab:'營運',status:'PENDING'})}`);return;}
  if(n.kind==='DIGEST'){const prefix=(path??'').split('/dashboard')[0];router.push(`${prefix}/dashboard/beauty`);return;}
  if(opening)return;setOpening(true);try{const r=await loadBeautyStoreNoticeTarget({storeId,id:n.id});if(!r.success){toast.error(r.error);return;}const prefix=(path??'').split('/dashboard')[0];router.push(`${prefix}/dashboard/beauty?${new URLSearchParams({tab:'班表',date:r.data.date,bookingId:r.data.id})}`);}catch{toast.error('預約讀取失敗，請重試');}finally{setOpening(false);}
 }}/>;
}
