// @vitest-environment jsdom
import {act,createElement} from 'react';import {createRoot} from 'react-dom/client';import {renderToString} from 'react-dom/server';import {describe,expect,it,vi} from 'vitest';
import {StoreNoticeBell} from '@/components/admin/store-notice-bell';
import type {StoreNoticeLoadResult} from '@/lib/store-notices';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const props=(load:()=>Promise<StoreNoticeLoadResult>)=>({storeId:'a',namespace:'course' as const,initialEnabled:true,loadNotices:load,markNotice:vi.fn()});
const data={success:true as const,storeId:'a',enabled:true,count:3,items:[],more:false,canHandle:false};
describe('initial notice badge',()=>{
 it('renders the authorized count in HTML and does not repeat the same initial request; opening still authorizes a full read',async()=>{
  const load=vi.fn(async()=>data),p={...props(load),initialSummary:{storeId:'a',count:7,latestAt:null}};
  expect(renderToString(createElement(StoreNoticeBell,p))).toContain('數位管家｜門市提醒，7 筆待處理');expect(load).not.toHaveBeenCalled();
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{await act(async()=>root.render(createElement(StoreNoticeBell,p)));expect(load).not.toHaveBeenCalled();expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('數位管家｜門市提醒，7 筆待處理');
   await act(async()=>host.querySelector('button')!.click());expect(load).toHaveBeenCalledWith({storeId:'a',handled:false,offset:0,summaryOnly:false});expect(document.body.textContent).toContain('沒有待處理通知');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('never renders another store count and falls back to the current authorized background read',async()=>{
  let resolve!:(r:StoreNoticeLoadResult)=>void;const load=vi.fn(()=>new Promise<StoreNoticeLoadResult>(r=>{resolve=r;}));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{await act(async()=>root.render(createElement(StoreNoticeBell,{...props(load),initialSummary:{storeId:'b',count:99,latestAt:null}})));expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('數位管家｜門市提醒');expect(load).toHaveBeenCalledWith({storeId:'a',handled:false,offset:0,summaryOnly:true});await act(async()=>resolve(data));expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('數位管家｜門市提醒，3 筆待處理');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
});
