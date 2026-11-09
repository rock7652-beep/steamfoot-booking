// @vitest-environment jsdom
import {act,createElement as h,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/customer-booking-goods',()=>({readCustomerBookingGoods:m.read}));
import {CustomerBookingGoodsField} from '@/components/add-ons/customer-booking-goods';
import {bookingGoodsInput,bookingGoodsTotal,type CustomerBookingGoodsDraft} from '@/lib/customer-booking-goods';
const catalog={revision:3,groups:[{id:'g',title:'飲品',kind:'SHARED_GOODS' as const,required:false,multiple:true,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'free',name:'水',price:0,duration:0,active:true}]}]};
it('selects quantities once and ignores a retained draft from another store or lesson',async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.read.mockResolvedValue({success:true,data:catalog});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const observe=vi.fn<(draft:CustomerBookingGoodsDraft|undefined)=>void>();
 function App(){const [d,set]=useState<CustomerBookingGoodsDraft>();return h(CustomerBookingGoodsField,{slug:'s',sessionId:'A1',draft:d,onChange:next=>{observe(next);set(next);}});}
 try{await act(async()=>root.render(h(App)));await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="增加茶"]')!.click());expect(bookingGoodsInput(observe.mock.lastCall?.[0],'s','A1')).toEqual({revision:3,selections:[{id:'tea',quantity:2}]});expect(bookingGoodsTotal(observe.mock.lastCall?.[0],'s','A1')).toBe(160);expect(bookingGoodsInput(observe.mock.lastCall?.[0],'other','A1')).toBeUndefined();expect(bookingGoodsInput(observe.mock.lastCall?.[0],'s','A2')).toBeUndefined();expect(host.textContent).toContain('茶 × 2');await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='取消商品選購')!.click());expect(bookingGoodsInput(observe.mock.lastCall?.[0],'s','A1')).toBeUndefined();}finally{await act(async()=>root.unmount());host.remove();}
});
it('drops late metadata after changing the selected lesson and hides closed catalogs',async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let resolve!:(r:unknown)=>void;m.read.mockImplementation(({sessionId})=>sessionId==='late'?new Promise(r=>{resolve=r;}):Promise.resolve({success:true,data:null}));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(h(CustomerBookingGoodsField,{slug:'s',sessionId:'late',onChange:vi.fn()})));await act(async()=>root.render(h(CustomerBookingGoodsField,{slug:'s',sessionId:'closed',onChange:vi.fn()})));expect(host.textContent).toBe('');await act(async()=>resolve({success:true,data:catalog}));expect(host.textContent).toBe('');}finally{await act(async()=>root.unmount());host.remove();}
});
