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
it('keeps the initial guide lightweight without loading checks or unrelated charge rows',async()=>{
 m.read.mockResolvedValue({success:true,storeId:'store',selfBooking:false,checks:[],samples:[]});
 const data={storeId:'store',chargeRulesActive:true,chargeCatalog:undefined,services:[],plans:[],techs:[],locations:[],access:{planAccess:true,staffAccess:true}} as unknown as BeautyDashboardData;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(h(BeautyOpeningGuide,{data})));expect(m.read).not.toHaveBeenCalled();await act(async()=>host.querySelector('button')!.click());expect(m.read).not.toHaveBeenCalled();expect(host.textContent).not.toContain('執行開店檢查');expect(host.textContent).not.toContain('／8');expect(host.querySelectorAll('ol li')).toHaveLength(7);expect(host.textContent).toContain('設定齊全後');}finally{await act(async()=>root.unmount());host.remove();}
});
