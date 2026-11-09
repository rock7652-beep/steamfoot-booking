'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {BookingAddOns} from '@/components/add-ons/booking';
import {readBeautySharedGoods,mutateBeautySharedGoods} from '@/server/actions/beauty-shared-goods';
export function BeautySharedGoodsPanel({storeId,appointmentId,canEdit,canCollect,canRefund,onBusy,onClose}:{storeId:string;appointmentId:string;canEdit:boolean;canCollect:boolean;canRefund:boolean;onBusy:(value:boolean)=>void;onClose:()=>void}){
 const router=useRouter(),[state,setState]=useState({dirty:false,busy:false});
 return <section aria-label="美業共同商品" className="mb-4 space-y-3 rounded-xl border border-earth-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-earth-900">共同商品</h3><p className="text-earth-600">同組預約共用，不增加服務時間。</p></div><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-4" disabled={state.busy} onClick={()=>{if(!state.dirty||window.confirm('尚有未儲存的修改，確定關閉？'))onClose();}}>關閉</button></div><BookingAddOns shared initialOpen module="BEAUTY" allowedMethods={['CASH','TRANSFER','CREDIT_CARD','OTHER']} read={readBeautySharedGoods} mutate={mutateBeautySharedGoods} storeId={storeId} bookingId={appointmentId} participantId={appointmentId} blocked={false} canEdit={canEdit} canCollect={canCollect} canRefund={canRefund} onBusy={onBusy} onStateChange={setState} onUpdated={()=>router.refresh()}/></section>;
}
