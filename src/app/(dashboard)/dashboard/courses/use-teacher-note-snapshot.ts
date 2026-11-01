"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {isMusicPreviewPage,subscribeMusicFinanceChange} from '@/lib/music-finance-sync';
import type {CalendarRosterSnapshots,CourseRosterSnapshot,TeacherNoteSnapshotLease} from './roster-source';

function ordered(value:unknown):unknown {
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(ordered);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)]));
 return value;
}
/** A note cannot change calendar occupancy, rights, permissions or other fields. */
export function teacherNoteOnlySnapshot(before:CourseRosterSnapshot,after:CourseRosterSnapshot){
 if(before.sessionId!==after.sessionId||!after.data?.session||!Array.isArray(after.data.roster))return false;
 const withoutNote=(snapshot:CourseRosterSnapshot)=>({...snapshot.data,session:{...snapshot.data.session,teacherNote:undefined}});
 return JSON.stringify(ordered(withoutNote(before)))===JSON.stringify(ordered(withoutNote(after)));
}

/** In-memory only, inside the existing account/store/permission-keyed boundary. */
export function useTeacherNoteSnapshot({incoming,invalidated,scope,enabled,onInvalidate}:{incoming:CalendarRosterSnapshots|undefined;invalidated:CalendarRosterSnapshots|undefined;scope:string;enabled:boolean;onInvalidate:(snapshot:CalendarRosterSnapshots|undefined)=>void}){
 const [patch,setPatch]=useState<{base:CalendarRosterSnapshots;snapshots:CalendarRosterSnapshots}>();
 const snapshots=patch&&patch.base===incoming?patch.snapshots:incoming;
 const epoch=useRef(0),active=useRef(false),leases=useRef(new Set<symbol>());
 const live=useRef({incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched:false});
 const patched=!!patch&&patch.base===incoming;
 useLayoutEffect(()=>{
  if(live.current.scope!==scope||live.current.incoming!==incoming)epoch.current++;
  live.current={incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched};
 },[incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched]);
 const shutdown=useCallback(()=>{active.current=false;epoch.current++;leases.current.clear();},[]);
 useEffect(()=>{active.current=true;return shutdown;},[shutdown]);
 const invalidate=useCallback(()=>{
  epoch.current++;const current=live.current;
  // Invalidate the source anchor as well as any pending local overlay, so a
  // higher-priority external update cannot briefly reveal the old source.
  const anchor=current.incoming??current.snapshots;current.invalidated=anchor;current.onInvalidate(anchor);
 },[]);
 const cancelPending=useCallback(()=>{epoch.current++;},[]);
 useEffect(()=>{
  if(!isMusicPreviewPage())return;
  return subscribeMusicFinanceChange((_kind,context)=>{
   epoch.current++;
   // Keep the provider's existing external-close refresh. Do not bless an old
   // patched calendar when another tab changes data during or after a note.
   if(!context?.calendarRefreshOwned&&(leases.current.size||live.current.patched))invalidate();
  });
 },[invalidate]);
 const begin=useCallback((sessionId:string):TeacherNoteSnapshotLease|null=>{
  const start=live.current,base=start.snapshots;
  if(!active.current||!start.enabled||!base||(start.invalidated===base||start.invalidated===start.incoming)||!base.details[sessionId])return null;
  const version=++epoch.current,token=Symbol('teacher-note');leases.current.add(token);
  const sameContext=()=>active.current&&live.current.scope===start.scope&&live.current.snapshots===base&&live.current.enabled;
  return {
   accept(snapshot){
    if(!leases.current.has(token)||!sameContext()||epoch.current!==version||(live.current.invalidated===base||live.current.invalidated===live.current.incoming)||!teacherNoteOnlySnapshot({sessionId,data:base.details[sessionId]},snapshot))return false;
    leases.current.delete(token);
    const next={storeId:base.storeId,details:{...base.details,[sessionId]:snapshot.data}};
    live.current.snapshots=next;live.current.patched=true;
    setPatch({base:start.incoming!,snapshots:next});return true;
   },
   invalidate(){if(active.current&&live.current.scope===start.scope&&live.current.enabled){invalidate();return true;}return false;},
   dispose(){leases.current.delete(token);},
  };
 },[invalidate]);
 return {snapshots,begin,invalidate,cancelPending};
}
