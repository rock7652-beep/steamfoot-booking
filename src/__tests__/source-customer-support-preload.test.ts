// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/components/admin/store-member-connection-panel',()=>({StoreMemberConnectionPanel:()=>h('p',null,'會員資料已備齊')}));
vi.mock('@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced',()=>({CustomerPanelAdvanced:()=>h('p',null,'LINE 資料已備齊')}));
import {PanelReadProvider,useInvalidateCustomerPlanReads} from '@/components/operations/panel-read-cache';
import {useCustomerPlanPreload} from '@/components/admin/use-customer-plan-preload';
import {DeferredCustomerSupport} from '@/app/(dashboard)/dashboard/courses/deferred-customer-support';
import type {CourseCustomerSource} from '@/app/(dashboard)/dashboard/courses/member-source';
it('shows prepared source support synchronously and discards it after a customer mutation',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const load=vi.fn().mockResolvedValue({success:true,data:{membership:{success:true},advanced:{data:{}}}}) as unknown as NonNullable<CourseCustomerSource['support']>;
 function App({open=false}:{open?:boolean}){const preload=useCustomerPlanPreload({support:load,storeId:'beauty-store',canReadCards:false});const invalidate=useInvalidateCustomerPlanReads();return h('main',null,h('button',{onClick:()=>preload.reader.read('customer')},'預讀'),h('button',{onClick:invalidate},'修改'),open?h(DeferredCustomerSupport,{customerId:'customer',storeId:'beauty-store',load,preload:true,expanded:true}):null);}
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{}))));await act(async()=>host.querySelector('button')!.click());
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true}))));expect(host.textContent).toContain('LINE 資料已備齊');expect(host.textContent).not.toContain('讀取會員資料中');expect(load).toHaveBeenCalledOnce();
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{}))));await act(async()=>host.querySelectorAll('button')[1].click());
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true}))));expect(load).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
