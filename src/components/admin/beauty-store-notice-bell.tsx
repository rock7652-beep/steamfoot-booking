'use client';
import {useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {StoreNoticeBell} from './store-notice-bell';
import {loadBeautyStoreNotices,markBeautyStoreNotice,loadBeautyStoreNoticeTarget} from '@/server/actions/beauty-store-notices';
export function BeautyStoreNoticeBell({storeId,initialEnabled=false}:{storeId:string;initialEnabled?:boolean}){
 const router=useRouter(),path=usePathname(),[opening,setOpening]=useState(false);
 return <StoreNoticeBell namespace="beauty" storeId={storeId} initialEnabled={initialEnabled} loadNotices={loadBeautyStoreNotices} markNotice={markBeautyStoreNotice} targetLabel={opening?'讀取預約中…':'查看預約'} closeOnViewTarget onViewTarget={async n=>{
  if(opening)return;setOpening(true);try{const r=await loadBeautyStoreNoticeTarget({storeId,id:n.id});if(!r.success){toast.error(r.error);return;}const prefix=(path??'').split('/dashboard')[0];router.push(`${prefix}/dashboard/beauty?${new URLSearchParams({tab:'班表',date:r.data.date,bookingId:r.data.id})}`);}catch{toast.error('預約讀取失敗，請重試');}finally{setOpening(false);}
 }}/>;
}
