// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {StoreNoticeBell} from '@/components/admin/store-notice-bell';
import {noticeSection} from '@/lib/store-notice-lifecycle';
import type {StoreNoticeItem,StoreNoticeLoadResult} from '@/lib/store-notices';
const find=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
const circle=(name:string,read=false)=>document.querySelector<HTMLButtonElement>(`button[aria-label="${read?'標為未讀':'標為已讀'}：${name}"]`);
const deferred=<T,>()=>{let resolve!:(value:T)=>void;return {promise:new Promise<T>(r=>{resolve=r;}),resolve:(value:T)=>resolve(value)};};
async function fixture(namespace:'steamfoot'|'course'|'beauty',size=2){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const now=new Date(),rows:StoreNoticeItem[]=Array.from({length:size},(_,i)=>({id:String(i),kind:'MOVE',customerName:i?'舊訊息'+i:'新訊息',courseName:'合成課程',coachName:'人員',previousCoachName:null,startsAt:now.toISOString(),previousStartsAt:null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:0,createdAt:new Date(+now-(i?4:1)*86400000).toISOString(),publishedAt:new Date(+now-(i?4:1)*86400000).toISOString(),updatedAt:now.toISOString()}));
 const snapshot=({storeId,handled,offset=0}:{storeId:string;handled:boolean;offset?:number}):StoreNoticeLoadResult=>{const visible=rows.filter(r=>noticeSection(new Date(r.publishedAt!),new Date(),r.handledAt)===(handled?'history':'latest'));return {success:true,storeId,enabled:true,count:rows.filter(r=>!r.handledAt).length,canHandle:true,more:visible.length>offset+50,items:visible.slice(offset,offset+50).map(r=>({...r}))};};
 const load=vi.fn(async input=>snapshot(input));
 const mark=vi.fn(async(input:{id:string;handled:boolean;storeId:string;revision:number})=>{const row=rows.find(r=>r.id===input.id)!;row.handledAt=input.handled?new Date().toISOString():null;row.revision++;return {success:true as const,storeId:input.storeId,data:{id:row.id,revision:row.revision,handledAt:row.handledAt,handledByName:null}};});
 const all=vi.fn(async({storeId}:{storeId:string})=>{const count=rows.filter(r=>!r.handledAt).length;rows.forEach(r=>{r.handledAt??=new Date().toISOString();r.revision++;});return {success:true as const,storeId,count};});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(StoreNoticeBell,{storeId:'s',namespace,initialEnabled:true,initialSummary:{storeId:'s',count:size,latestAt:null},loadNotices:load,markNotice:mark,markAllNotices:all})));
 await act(async()=>host.querySelector('button')!.click());
 return {rows,load,mark,all,host,snapshot,dispose:async()=>{await act(async()=>root.unmount());host.remove();}};
}
it.each(['steamfoot','course','beauty'] as const)('%s single O removes latest immediately, confirms storage and appears in history',async namespace=>{
 const f=await fixture(namespace),gate=deferred<void>(),persist=f.mark.getMockImplementation()!;
 f.mark.mockImplementation(async input=>{await gate.promise;return persist(input);});
 try{
  await act(async()=>circle('新訊息')!.click());
  expect(circle('新訊息')).toBeNull();expect(document.body.textContent).toContain('儲存中…');
  expect(f.rows[0].handledAt).toBeNull();
  await act(async()=>gate.resolve());
  expect(document.body.textContent).toContain('已移至歷史訊息');expect(f.rows[0].handledAt).not.toBeNull();
  await act(async()=>find('歷史訊息').click());
  expect(circle('新訊息',true)).toBeTruthy();expect(circle('舊訊息1')).toBeTruthy();
  expect(f.rows[0].publishedAt).toBe(f.rows[0].createdAt);
 }finally{await f.dispose();}
});
it('restores a failed single O without falsely reporting a completed move',async()=>{
 const f=await fixture('steamfoot'),gate=deferred<void>();
 f.mark.mockImplementation(async()=>{await gate.promise;throw Error('simulated failure');});
 try{await act(async()=>circle('新訊息')!.click());expect(circle('新訊息')).toBeNull();await act(async()=>gate.resolve());expect(circle('新訊息')).toBeTruthy();expect(document.body.textContent).toContain('儲存結果未確認');expect(document.body.textContent).not.toContain('已移至歷史訊息');}finally{await f.dispose();}
});
it.each(['steamfoot','course','beauty'] as const)('%s bulk waits for write confirmation, then clears latest before the follow-up read',async namespace=>{
 const f=await fixture(namespace),write=deferred<void>(),read=deferred<StoreNoticeLoadResult>(),persist=f.all.getMockImplementation()!;
 f.all.mockImplementation(async input=>{await write.promise;return persist(input);});
 try{
  await act(async()=>find('全部標為已讀').click());expect(circle('新訊息')).toBeTruthy();expect(find('處理中…')).toBeTruthy();
  f.load.mockImplementationOnce(async()=>read.promise);
  await act(async()=>write.resolve());
  expect(circle('新訊息')).toBeNull();expect(document.body.textContent).toContain('已移至歷史訊息');expect(f.rows.every(r=>r.handledAt)).toBe(true);
  await act(async()=>read.resolve(f.snapshot({storeId:'s',handled:false})));
  await act(async()=>find('歷史訊息').click());
  expect(circle('新訊息',true)).toBeTruthy();expect(circle('舊訊息1',true)).toBeTruthy();
 }finally{await f.dispose();}
});
it('undo returns a recent read notice to latest, while old notices stay in history',async()=>{
 const f=await fixture('course');
 try{
  await act(async()=>circle('新訊息')!.click());await act(async()=>find('復原').click());expect(circle('新訊息')).toBeTruthy();
  await act(async()=>find('歷史訊息').click());await act(async()=>circle('舊訊息1')!.click());await act(async()=>circle('舊訊息1',true)!.click());
  expect(circle('舊訊息1')).toBeTruthy();expect(f.rows[1].publishedAt).toBe(f.rows[1].createdAt);
 }finally{await f.dispose();}
});
it('a fresh arrival during bulk reconciliation remains unread and visible',async()=>{
 const f=await fixture('beauty'),read=deferred<StoreNoticeLoadResult>();
 try{
  f.load.mockImplementationOnce(async()=>read.promise);await act(async()=>find('全部標為已讀').click());
  const fresh={...f.rows[0],id:'new-arrival',customerName:'剛收到的新訊息',handledAt:null,revision:0,publishedAt:new Date().toISOString()};f.rows.push(fresh);
  await act(async()=>read.resolve(f.snapshot({storeId:'s',handled:false})));
  expect(circle('剛收到的新訊息')).toBeTruthy();expect(f.host.querySelector('button')!.getAttribute('aria-label')).toContain('1 筆未讀');
 }finally{await f.dispose();}
});
it('bulk from a later page returns to page one and preserves a new arrival there',async()=>{
 const f=await fixture('steamfoot',101);
 try{
  for(const row of f.rows)row.publishedAt=f.rows[0].publishedAt;
  await act(async()=>window.dispatchEvent(new Event('focus')));
  await act(async()=>find('下一頁').click());
  expect(f.load.mock.calls.at(-1)![0].offset).toBe(50);
  const persist=f.all.getMockImplementation()!;
  f.all.mockImplementation(async input=>{const response=await persist(input);f.rows.push({...f.rows[0],id:'fresh-on-first-page',customerName:'第一頁新訊息',handledAt:null,revision:0});return response;});
  const before=f.load.mock.calls.length;
  await act(async()=>find('全部標為已讀').click());
  expect(f.load.mock.calls.slice(before).map(call=>call[0].offset)).toEqual([0]);
  expect(circle('第一頁新訊息')).toBeTruthy();
 }finally{await f.dispose();}
});
