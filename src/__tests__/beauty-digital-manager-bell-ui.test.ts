// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({push:vi.fn(),mark:vi.fn(),target:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/beauty/admin/dashboard/beauty',useRouter:()=>({push:m.push}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/beauty-store-notices',()=>({markBeautyStoreNotice:m.mark,loadBeautyStoreNoticeTarget:m.target}));
import {BeautyStoreNoticeBell} from '@/components/admin/beauty-store-notice-bell';
it('opens the scoped pending payment list from a compact notice',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const row={id:'digital:p',kind:'PAYMENT',customerName:'方案付款',courseName:'',coachName:'',previousCoachName:null,startsAt:'2026-10-30T02:00:00Z',previousStartsAt:null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:0,createdAt:'2026-10-30T02:00:00Z',updatedAt:'2026-10-30T02:00:00Z',canViewCourse:true};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({success:true,storeId:'store',enabled:true,items:[row],count:1,canHandle:true,more:false})})));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(BeautyStoreNoticeBell,{storeId:'store',initialEnabled:true})));
  const find=(text:string)=>[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===text||x.textContent?.includes(text));
  await act(async()=>find('門市通知，1 筆待處理')!.click());
  await act(async()=>find('方案付款')!.click());
  await act(async()=>find('查看待核帳')!.click());
  expect(m.push).toHaveBeenCalledWith('/s/beauty/admin/dashboard/beauty?tab=%E7%87%9F%E9%81%8B&status=PENDING');
  expect(m.target).not.toHaveBeenCalled();
 } finally {await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
