// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {StoreNoticeBell} from "@/components/admin/store-notice-bell";
import type {StoreNoticeLoadResult} from "@/lib/store-notices";
const deferred=()=>{let resolve!:(r:StoreNoticeLoadResult)=>void;const promise=new Promise<StoreNoticeLoadResult>(r=>{resolve=r;});return {promise,resolve};};
it.each(["course","steamfoot"] as const)('renders %s bell before any request and fetches snapshots only on open',async namespace=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const summary=deferred(),list=deferred();
 const load=vi.fn().mockImplementation(({summaryOnly})=>summaryOnly?summary.promise:list.promise);
 const props={storeId:'s',namespace,initialEnabled:true,loadNotices:load,markNotice:vi.fn()};
 expect(renderToStaticMarkup(createElement(StoreNoticeBell,props))).toContain('aria-label="門市通知"');expect(load).not.toHaveBeenCalled();
 expect(renderToStaticMarkup(createElement(StoreNoticeBell,{...props,initialEnabled:false}))).not.toContain('<button');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(StoreNoticeBell,props)));
  const bell=host.querySelector('button')!;expect(bell).toBeTruthy();expect(load).toHaveBeenCalledTimes(1);expect(load.mock.calls[0][0]).toMatchObject({summaryOnly:true});
  await act(async()=>bell.click());expect(document.body.textContent).toContain('讀取中');expect(load).toHaveBeenCalledTimes(2);expect(load.mock.calls[1][0]).toMatchObject({summaryOnly:false});
  await act(async()=>list.resolve({success:true,storeId:'s',enabled:true,items:[],count:9,canHandle:true,more:false}));
  await act(async()=>summary.resolve({success:true,storeId:'s',enabled:true,items:[],count:1,canHandle:false,more:false}));
  expect(bell.getAttribute('aria-label')).toContain('9 筆待處理');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="關閉通知"]')!.click());
  expect(load.mock.calls.at(-1)![0]).toMatchObject({summaryOnly:true});
 }finally{await act(async()=>root.unmount());host.remove();}
});
