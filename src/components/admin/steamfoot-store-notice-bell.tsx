"use client";
import type {InitialStoreNoticeSummary} from "@/lib/store-notices";
import {useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import dynamic from "next/dynamic";
import {loadSteamfootStoreNotices,markSteamfootStoreNotice,loadSteamfootVipNoticeTarget,loadSteamfootReminderTarget} from "@/server/actions/steamfoot-store-notices";
import {toast} from "sonner";
import {StoreNoticeBell} from "./store-notice-bell";
const BookingDetails=dynamic(()=>import("@/app/(dashboard)/dashboard/bookings/booking-detail-drawer").then(m=>m.BookingDetailDrawer),{loading:()=> <p role="status">讀取預約中…</p>});
export function SteamfootStoreNoticeBell({storeId,initialEnabled=false,initialSummary}:{storeId:string;initialEnabled?:boolean;initialSummary?:InitialStoreNoticeSummary|null}) {
 const router=useRouter(),pathname=usePathname();
 const [booking,setBooking]=useState<{id:string;readOnly:boolean}|null>(null),[refreshKey,setRefreshKey]=useState(0);
 return <>
  <StoreNoticeBell initialEnabled={initialEnabled} initialSummary={initialSummary} storeId={storeId} namespace="steamfoot" loadNotices={loadSteamfootStoreNotices} markNotice={markSteamfootStoreNotice} refreshKey={refreshKey} closeOnViewTarget={n=>n.kind==='PAYMENT'||n.kind==='LEAD'||n.kind==='SUPPORT'||n.kind==='VIP'||n.kind==='DIGEST'} onViewTarget={(n,canHandle)=>{const prefix=(pathname??'').split('/dashboard')[0];if(n.kind==='PAYMENT')router.push(`${prefix}/dashboard/payments`);else if(n.kind==='LEAD'||n.kind==='SUPPORT')router.push(`${prefix}/dashboard/digital-butler/leads${n.kind==='SUPPORT'?'?handoff=waiting':''}`);else if(n.kind==='DIGEST')router.push(`${prefix}/dashboard`);else if(n.kind==='VIP')void loadSteamfootVipNoticeTarget({storeId,id:n.id}).then(r=>{if(r.success)router.push(`${prefix}/dashboard/customers/${encodeURIComponent(r.data.id)}`);else toast.error(r.error);}).catch(()=>toast.error('顧客資料讀取失敗，請重試'));else if(n.kind==='REMINDER')void loadSteamfootReminderTarget({storeId,id:n.id}).then(r=>{if(r.success)setBooking({id:r.data.id,readOnly:!canHandle});else toast.error(r.error);}).catch(()=>toast.error('預約讀取失敗，請重試'));else if(n.targetId)setBooking({id:n.targetId,readOnly:!canHandle});}}/>
  {booking&&<BookingDetails key={booking.id} open bookingId={booking.id} resolvedStoreId={storeId} readOnly={booking.readOnly} onClose={()=>{setBooking(null);setRefreshKey(v=>v+1);}} onUpdated={()=>setRefreshKey(v=>v+1)}/>}
 </>;
}
