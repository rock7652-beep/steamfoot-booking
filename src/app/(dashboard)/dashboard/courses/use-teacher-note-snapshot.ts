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
 const [state,setState]=useState<{patch?:{base:CalendarRosterSnapshots;snapshots:CalendarRosterSnapshots;scope:string;changedIds:string[]};blocked?:{scope:string;source:CalendarRosterSnapshots}}>({});
 const {patch,blocked:reconcileRequest}=state;
 // There is no server revision on this DTO. A replaced parent response can
 // predate a confirmed note, so a conflicting response must be read again.
 // Explicit invalidation already has a refresh owner; do not duplicate it.
 const sourceConflict=!!(patch&&patch.scope===scope&&enabled&&incoming&&patch.base!==incoming&&invalidated!==patch.base&&invalidated!==patch.snapshots&&patch.changedIds.some(id=>JSON.stringify(ordered(incoming.details[id]))!==JSON.stringify(ordered(patch.snapshots.details[id]))));
 // Adjust this hook's own state when its input changes, before descendants
 // render. Do not publish stale data and invalidate it in a later effect.
 if(patch&&(patch.base!==incoming||patch.scope!==scope))setState(sourceConflict&&incoming?{blocked:{scope,source:incoming}}:{});
 else if(reconcileRequest&&(reconcileRequest.source!==incoming||reconcileRequest.scope!==scope))setState({});
 const patched=!!patch&&patch.scope===scope&&patch.base===incoming;
 const blocked=sourceConflict||reconcileRequest?.scope===scope&&reconcileRequest.source===incoming;
 const snapshots=blocked?undefined:patched?patch.snapshots:incoming;
 const epoch=useRef(0),active=useRef(false),leases=useRef(new Set<symbol>());
 const live=useRef({incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched:false,changedIds:[] as string[]});
 useLayoutEffect(()=>{
  if(live.current.scope!==scope||live.current.incoming!==incoming)epoch.current++;
  live.current={incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched,changedIds:patched?patch.changedIds:[]};
 },[incoming,snapshots,invalidated,scope,enabled,onInvalidate,patched,patch]);
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
    const changedIds=[...new Set([...start.changedIds,sessionId])];
    live.current.snapshots=next;live.current.patched=true;live.current.changedIds=changedIds;
    setState({patch:{base:start.incoming!,snapshots:next,scope:start.scope,changedIds}});return true;
   },
   invalidate(){if(active.current&&live.current.scope===start.scope&&live.current.enabled){invalidate();return true;}return false;},
   dispose(){leases.current.delete(token);},
  };
 },[invalidate]);
 return {snapshots,begin,invalidate,cancelPending,reconcileRequest};
}
