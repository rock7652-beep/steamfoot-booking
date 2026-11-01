// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {StoreNoticeBell} from "@/components/admin/store-notice-bell";
import type {StoreNoticeLoadResult} from "@/lib/store-notices";
const deferred=()=>{let resolve!:(r:StoreNoticeLoadResult)=>void;const promise=new Promise<StoreNoticeLoadResult>(r=>{resolve=r;});return {promise,resolve};};
it.each(["course","steamfoot","beauty"] as const)('renders %s bell before any request and fetches snapshots only on open',async namespace=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const summary=deferred(),list=deferred();
 const load=vi.fn().mockImplementation(({summaryOnly})=>summaryOnly?summary.promise:list.promise);
 const props={storeId:'s',namespace,initialEnabled:true,loadNotices:load,markNotice:vi.fn()};
 expect(renderToStaticMarkup(createElement(StoreNoticeBell,props))).toContain('aria-label="數位管家｜門市提醒"');expect(load).not.toHaveBeenCalled();
 expect(renderToStaticMarkup(createElement(StoreNoticeBell,{...props,initialEnabled:false}))).not.toContain('<button');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(StoreNoticeBell,props)));
  const bell=host.querySelector('button')!;expect(bell).toBeTruthy();expect(load).toHaveBeenCalledTimes(1);expect(load.mock.calls[0][0]).toMatchObject({summaryOnly:true});
  await act(async()=>bell.click());expect(document.body.textContent).toContain('讀取中');expect(load).toHaveBeenCalledTimes(2);expect(load.mock.calls[1][0]).toMatchObject({summaryOnly:false});
  await act(async()=>list.resolve({success:true,storeId:'s',enabled:true,items:[],count:9,canHandle:true,more:false}));
  await act(async()=>summary.resolve({success:true,storeId:'s',enabled:true,items:[],count:1,canHandle:false,more:false}));
  expect(bell.getAttribute('aria-label')).toContain('9 筆未讀');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="關閉通知"]')!.click());
  expect(load.mock.calls.at(-1)![0]).toMatchObject({summaryOnly:true});
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('does not start a closing summary request that could race with target navigation',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const row={id:'n',kind:'MOVE' as const,customerName:'顧客',courseName:'服務',coachName:'技師',previousCoachName:null,startsAt:'2026-10-26T04:00:00Z',previousStartsAt:null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:1,createdAt:'2026-10-25T04:00:00Z',updatedAt:'2026-10-25T04:00:00Z',canViewCourse:true};
 const load=vi.fn().mockResolvedValue({success:true,storeId:'s',enabled:true,items:[row],count:1,canHandle:true,more:false}),target=vi.fn();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(StoreNoticeBell,{storeId:'s',namespace:'beauty',initialEnabled:true,loadNotices:load,markNotice:vi.fn(),onViewTarget:target,closeOnViewTarget:true})));
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!.click());
  const before=load.mock.calls.length;
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='查看預約')!.click());
  expect(target).toHaveBeenCalledWith(expect.objectContaining({id:'n'}),true);expect(document.querySelector('[role="dialog"]')).toBeNull();expect(load).toHaveBeenCalledTimes(before);
  await act(async()=>host.querySelector('button')!.click());expect(load).toHaveBeenCalledTimes(before+1);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it.each(['steamfoot','course','beauty'] as const)('bulk marks %s notices once and refreshes the authoritative count',async namespace=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 let resolve!:(r:{success:true;storeId:string;count:number})=>void;
 const markAll=vi.fn().mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const load=vi.fn().mockResolvedValue({success:true,storeId:'s',enabled:true,items:[],count:77,canHandle:true,more:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(StoreNoticeBell,{storeId:'s',namespace,initialEnabled:true,loadNotices:load,markNotice:vi.fn(),markAllNotices:markAll})));
  await act(async()=>host.querySelector('button')!.click());
  const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='全部標為已讀')!;
  await act(async()=>{button.click();button.click();});
  expect(markAll).toHaveBeenCalledExactlyOnceWith({storeId:'s'});expect(button.disabled).toBe(true);
  load.mockResolvedValue({success:true,storeId:'s',enabled:true,items:[],count:0,canHandle:true,more:false});
  await act(async()=>resolve({success:true,storeId:'s',count:77}));
  expect(host.querySelector('button')!.getAttribute('aria-label')).toContain('0 筆未讀');
  expect(document.body.textContent).toContain('目前沒有最新消息');expect(button.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('keeps a bulk failure visible and allows retry without clearing the count',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const load=vi.fn().mockResolvedValue({success:true,storeId:'s',enabled:true,items:[],count:2,canHandle:true,more:false});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(StoreNoticeBell,{storeId:'s',namespace:'steamfoot',initialEnabled:true,loadNotices:load,markNotice:vi.fn(),markAllNotices:vi.fn().mockResolvedValue({success:false,error:'無法儲存'})})));
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='全部標為已讀')!.click());
  expect(host.querySelector('button')!.getAttribute('aria-label')).toContain('2 筆未讀');
  expect(document.body.textContent).toContain('無法儲存');
 }finally{await act(async()=>root.unmount());host.remove();}
});
