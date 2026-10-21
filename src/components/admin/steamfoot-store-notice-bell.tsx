"use client";
import {useState} from "react";
import dynamic from "next/dynamic";
import {loadSteamfootStoreNotices,markSteamfootStoreNotice} from "@/server/actions/steamfoot-store-notices";
import {StoreNoticeBell} from "./store-notice-bell";
const BookingDetails=dynamic(()=>import("@/app/(dashboard)/dashboard/bookings/booking-detail-drawer").then(m=>m.BookingDetailDrawer),{loading:()=> <p role="status">讀取預約中…</p>});
export function SteamfootStoreNoticeBell({storeId}:{storeId:string}) {
 const [booking,setBooking]=useState<{id:string;readOnly:boolean}|null>(null),[refreshKey,setRefreshKey]=useState(0);
 return <>
  <StoreNoticeBell storeId={storeId} namespace="steamfoot" loadNotices={loadSteamfootStoreNotices} markNotice={markSteamfootStoreNotice} refreshKey={refreshKey} onViewTarget={(n,canHandle)=>{if(n.targetId)setBooking({id:n.targetId,readOnly:!canHandle});}}/>
  {booking&&<BookingDetails key={booking.id} open bookingId={booking.id} resolvedStoreId={storeId} readOnly={booking.readOnly} onClose={()=>{setBooking(null);setRefreshKey(v=>v+1);}} onUpdated={()=>setRefreshKey(v=>v+1)}/>}
 </>;
}
