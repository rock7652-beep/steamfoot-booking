// @vitest-environment jsdom
import {act,createElement as h,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/beauty-opening-check',()=>({readBeautyOpeningCheck:m.read}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:({href,children}:{href:string;children:ReactNode})=>h('a',{href},children)}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:{children:ReactNode})=>h('div',{role:'dialog'},children)}));
import {BeautyOpeningGuide} from '@/components/beauty/opening-guide';
import type {BeautyDashboardData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('keeps the existing opening check usable when unrelated charge rows are not loaded on the settings page',async()=>{
 m.read.mockResolvedValue({success:true,storeId:'store',selfBooking:false,checks:[],samples:[]});
 const data={storeId:'store',chargeRulesActive:true,chargeCatalog:undefined,services:[],plans:[],techs:[],locations:[],access:{planAccess:true,staffAccess:true}} as unknown as BeautyDashboardData;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(h(BeautyOpeningGuide,{data})));expect(m.read).not.toHaveBeenCalled();await act(async()=>host.querySelector('button')!.click());expect(m.read).toHaveBeenCalledWith({storeId:'store'});expect(host.textContent).toContain('顧客自行預約目前關閉');expect(host.textContent).toContain('執行開店檢查');}finally{await act(async()=>root.unmount());host.remove();}
});
