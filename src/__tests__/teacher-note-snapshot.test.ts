// @vitest-environment jsdom
import {act,createElement,useState,useLayoutEffect} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useTeacherNoteSnapshot,teacherNoteOnlySnapshot} from '@/app/(dashboard)/dashboard/courses/use-teacher-note-snapshot';
import type {CalendarRosterSnapshots,CourseRosterSnapshot} from '@/app/(dashboard)/dashboard/courses/roster-source';
import {MUSIC_FINANCE_SIGNAL,publishMusicFinanceChange} from '@/lib/music-finance-sync';
import {preparedRoster} from './fixtures/prepared-roster';
let root:Root,host:HTMLDivElement,controller:ReturnType<typeof useTeacherNoteSnapshot>;
const base=()=>({storeId:'store-a',details:{a:preparedRoster(),b:preparedRoster()}});
const changed=(data:CourseRosterSnapshot['data']=preparedRoster(),note='後端正規化備註'):CourseRosterSnapshot=>({sessionId:'a',data:{...data,session:{...data.session,teacherNote:note}}});
function Harness({incoming,scope='store-a:2026-10',enabled=true}:{incoming:CalendarRosterSnapshots;scope?:string;enabled?:boolean}){
 const [invalidated,onInvalidate]=useState<CalendarRosterSnapshots>();
 const value=useTeacherNoteSnapshot({incoming,invalidated,scope,enabled,onInvalidate});useLayoutEffect(()=>{controller=value;},[value]);return null;
}
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubEnv('NEXT_PUBLIC_BUILD_ENV','staging');window.history.replaceState(null,'','/s/lubymusic/admin/dashboard/courses');localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();window.history.replaceState(null,'','/');vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('replaces the entire confirmed class only and preserves the untouched class and input',async()=>{
 const input=base();await act(async()=>root.render(createElement(Harness,{incoming:input})));
 const lease=controller.begin('a')!;const next:CourseRosterSnapshot=JSON.parse(JSON.stringify(changed(input.details.a)));
 await act(async()=>{expect(lease.accept(next)).toBe(true);publishMusicFinanceChange('general','general:owned',{calendarRefreshOwned:true});lease.dispose();});
 expect(controller.snapshots?.details.a).toBe(next.data);expect(controller.snapshots?.details.b).toBe(input.details.b);expect(input.details.a.session.teacherNote).not.toBe(next.data.session.teacherNote);
 const second=controller.begin('a')!;await act(async()=>expect(second.accept(changed(next.data,'第二次'))).toBe(true));
 expect(controller.snapshots?.details.a.session.teacherNote).toBe('第二次');expect(lease.accept(next)).toBe(false);
});
it.each(['scope','incoming','invalidate','external','away-and-back','unmount','superseded'])('rejects a late snapshot after %s',async kind=>{
 const input=base();await act(async()=>root.render(createElement(Harness,{incoming:input})));
 const lease=controller.begin('a')!;
 await act(async()=>{
  if(kind==='scope')root.render(createElement(Harness,{incoming:input,scope:'other-store:2026-11'}));
  if(kind==='incoming')root.render(createElement(Harness,{incoming:base()}));
  if(kind==='invalidate')controller.invalidate();
  if(kind==='external')window.dispatchEvent(new StorageEvent('storage',{key:MUSIC_FINANCE_SIGNAL,newValue:'general:external'}));
  if(kind==='away-and-back')controller.cancelPending();
  if(kind==='unmount'){root.unmount();root=createRoot(host);}
  if(kind==='superseded')controller.begin('a');
 });
 expect(lease.accept(changed(input.details.a))).toBe(false);lease.dispose();
});
it('invalidates an accepted patch on a later external change, retaining the note while blocking its reuse',async()=>{
 const input=base();await act(async()=>root.render(createElement(Harness,{incoming:input})));
 await act(async()=>{expect(controller.begin('a')!.accept(changed(input.details.a))).toBe(true);});
 await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:MUSIC_FINANCE_SIGNAL,newValue:'general:later'})));
 expect(controller.snapshots?.details.a.session.teacherNote).toBe('後端正規化備註');expect(controller.begin('a')).toBeNull();
});
it.each(['balance','attendance','permission','time','identity'])('rejects a full DTO with a concurrent %s change',kind=>{
 const input=base(),before={sessionId:'a',data:input.details.a},next=changed(input.details.a);
 if(kind==='balance')next.data.roster=[{...next.data.roster[0],cardRemaining:999}];
 if(kind==='attendance')next.data.session={...next.data.session,teacherAttendance:'NO_SHOW'};
 if(kind==='permission')next.data.canPurchase=!next.data.canPurchase;
 if(kind==='time')next.data.session={...next.data.session,startsAt:'2026-12-01T00:00:00Z'};
 if(kind==='identity')next.sessionId='other';
 expect(teacherNoteOnlySnapshot(before,next)).toBe(false);
});
it('does not lease disabled or absent classes',async()=>{
 await act(async()=>root.render(createElement(Harness,{incoming:base(),enabled:false})));expect(controller.begin('a')).toBeNull();
 await act(async()=>root.render(createElement(Harness,{incoming:base()})));expect(controller.begin('missing')).toBeNull();
});

it('falls back against the current same-scope snapshot but never invalidates another store',async()=>{
 const input=base();await act(async()=>root.render(createElement(Harness,{incoming:input})));
 const lease=controller.begin('a')!;await act(async()=>root.render(createElement(Harness,{incoming:base()})));
 await act(async()=>expect(lease.invalidate()).toBe(true));expect(controller.begin('a')).toBeNull();
 await act(async()=>root.render(createElement(Harness,{incoming:base(),scope:'store-b:2026-10'})));
 expect(lease.invalidate()).toBe(false);expect(controller.begin('a')).not.toBeNull();lease.dispose();
});
