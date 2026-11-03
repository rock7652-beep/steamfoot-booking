// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard/bookings',useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/admin/settings-panel-context',()=>({useSettingsPanelGuard:vi.fn()}));
import {SharedGoodsChoices,type GoodsSelection} from '@/components/add-ons/shared-goods-choices';
import {BookingAddOns} from '@/components/add-ons/booking';
import {resolveSharedGoods,addOnTotals,addOnGroups} from '@/lib/add-ons';
const groups=addOnGroups.parse([{id:'g',kind:'SHARED_GOODS',title:'飲品',multiple:true,required:false,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'free',name:'免費茶',price:0,duration:0,active:true}]}]);
it('only shows quantity after selecting goods, and supports repeated units of a single SKU',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Form(){const [selections,set]=useState<GoodsSelection[]>([]);return createElement(SharedGoodsChoices,{groups,selections,onChange:set});}
 try{await act(async()=>root.render(createElement(Form)));
 expect(host.querySelector('output')).toBeNull();await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());
 expect(host.querySelector('output')!.textContent).toBe('1');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="增加茶"]')!.click());expect(host.querySelector('output')!.textContent).toBe('2');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="減少茶"]')!.click());expect(host.querySelector<HTMLButtonElement>('[aria-label="減少茶"]')!.disabled).toBe(true);
 await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());expect(host.querySelector('output')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('saves quantities in the shared panel and shows the line total without creating personal items',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 type Result=NonNullable<Extract<Awaited<ReturnType<typeof import('@/server/actions/steamfoot-add-ons').readSteamfootParticipantAddOns>>,{success:true}>['data']>;
 let data:Result={catalogRevision:1,groups,order:null,receipts:[],collected:0,editable:true,canSelect:true};
 const read=vi.fn(async()=>({success:true as const,data})),mutate=vi.fn(async(input:unknown)=>{const d=input as {selections:{id:string;quantity:number}[]};const items=resolveSharedGoods(groups,d.selections);data={...data,order:{id:'o',revision:1,total:addOnTotals(items).price,cancelled:false,items}};return {success:true as const,data:{id:'o',revision:1,before:[],after:items}};});
 const button=(name:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
 try{await act(async()=>root.render(createElement(BookingAddOns,{shared:true,module:'STEAMFOOT',storeId:'s',bookingId:'b',participantId:'p',blocked:false,canEdit:true,canCollect:true,canRefund:true,onBusy:vi.fn(),onUpdated:vi.fn(),read,mutate})));
 await act(async()=>button('共同商品（整筆預約） ▾').click());await act(async()=>button('調整品項').click());
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="增加茶"]')!.click());
 await act(async()=>button('儲存附加項目').click());
 expect(mutate).toHaveBeenCalledOnce();expect(mutate).toHaveBeenCalledWith(expect.objectContaining({operation:'SAVE',selections:[{id:'tea',quantity:2}]}));
 expect(host.textContent).toContain('× 2');expect(host.textContent).toContain('$160');expect(host.textContent).toContain('共 2 件');
 }finally{await act(async()=>root.unmount());host.remove();}
});
