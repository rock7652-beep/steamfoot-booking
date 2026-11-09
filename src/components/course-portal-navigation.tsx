"use client";
import type {ReactNode} from 'react';
import {SteamButlerLogo} from '@/components/steam-butler-logo';
export type PortalIconName = "home" | "calendar" | "bookings" | "account" | "records" | "health";
export function PortalIcon({ name }: { name: PortalIconName }) {
  const paths: Record<PortalIconName, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    bookings: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></>,
    health: <><path d="M3 3v18h18M6 15l4-5 4 3 6-8"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    records: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}
export function CoursePortalBrand({storeName,storeFirst=false,children}:{storeName:string;storeFirst?:boolean;children?:ReactNode}) {
  if(storeFirst)return <div aria-label="預約店家" className="flex w-full min-w-0 items-center justify-between gap-3"><SteamButlerLogo className="w-20 shrink-0"/><strong className="min-w-0 break-words text-right text-lg font-semibold text-primary-900">{storeName}</strong></div>;
  return <div className="cp-brand"><SteamButlerLogo className="w-28"/>{children ?? <small>{storeName}</small>}</div>;
}
export function CoursePortalNavigation({items,current,onSelect,disabled=false}:{disabled?:boolean;items:{id:string;label:string;icon:PortalIconName}[];current:string;onSelect:(id:string)=>void}) {return <nav className="cp-nav" aria-label="主要功能">{items.map(item=><button key={item.id} disabled={disabled} aria-current={current===item.id?'page':undefined} onClick={()=>onSelect(item.id)}><PortalIcon name={item.icon}/>{item.label}</button>)}</nav>;}
