// @vitest-environment jsdom
import {act,createElement as h,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/dashboard-link',()=>({DashboardLink:({href,children}:{href:string;children:ReactNode})=>h('a',{href},children)}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:{children:ReactNode})=>h('div',{role:'dialog'},children)}));
import {beautyOpeningSetupComplete} from '@/lib/beauty/opening-guide';
import {BeautyOpeningGuide} from '@/components/beauty/opening-guide';
import {publishStoreProfileSaved} from '@/lib/store-profile-sync';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const store={name:'合成店家',address:'合成地址',shopPhone:'測試電話'};
const setup={store,hoursConfigured:true,services:[{id:'s',name:'服務',active:true,duration:60,buffer:0,price:0,singlePriceConfigured:true}],technicians:[{id:'t',name:'技師',active:true,serviceIds:['s']}],locations:[{isActive:true}],canReadTechnicians:true,canReadPlans:true};
const data={storeId:'A',openingHoursConfigured:true,services:setup.services,techs:setup.technicians,locations:setup.locations,plans:[],access:{planAccess:true,staffAccess:true}} as unknown as BeautyDashboardData;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('hides the guide after basic setup, with no optional integrations, plans, extra accounts or booking enabled',()=>{
 expect(beautyOpeningSetupComplete(setup)).toBe(true);
 expect(beautyOpeningSetupComplete({...setup,services:[{...setup.services[0],singlePriceConfigured:null}]})).toBe(true);
 for(const changes of [{store:{...store,address:''}},{hoursConfigured:false},{locations:[]},{services:[]},{technicians:[]},{technicians:[{...setup.technicians[0],serviceIds:[]}]},{canReadPlans:false},{services:[{...setup.services[0],singlePriceConfigured:false}]}])expect(beautyOpeningSetupComplete({...setup,...changes})).toBe(false);
});
it('renders no opening or completion button for a configured store',async()=>{
 const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(h(BeautyOpeningGuide,{data,store})));expect(host.textContent).toBe('');expect(host.querySelector('button')).toBeNull();}finally{await act(async()=>root.unmount());}
});
it('hides immediately after the last store field is confirmed, ignores other stores, and does not mix scopes',async()=>{
 const host=document.createElement('div'),root=createRoot(host),incomplete={...store,address:''};
 try{
  await act(async()=>root.render(h(BeautyOpeningGuide,{data,store:incomplete})));expect(host.textContent).toContain('開店設定引導');
  await act(async()=>publishStoreProfileSaved('B',store));expect(host.textContent).toContain('開店設定引導');
  await act(async()=>publishStoreProfileSaved('A',store));expect(host.querySelector('button')).toBeNull();
  await act(async()=>root.render(h(BeautyOpeningGuide,{data:{...data,storeId:'B'},store:incomplete})));expect(host.textContent).toContain('開店設定引導');
  await act(async()=>publishStoreProfileSaved('A',store));expect(host.textContent).toContain('開店設定引導');
 }finally{await act(async()=>root.unmount());}
});
