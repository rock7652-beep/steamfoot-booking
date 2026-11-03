// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({saveBeautyCatalog:m.save,saveBeautyLocation:vi.fn(),saveBeautySettings:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),usePathname:()=>'/test',useSearchParams:()=>new URLSearchParams()}));
import {BeautyChargesList} from '@/components/beauty/charges-list';
import {BeautyCatalogEditor} from '@/components/beauty/catalog-editor';
import {BeautySharedMembers} from '@/components/beauty/shared-members';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const service={id:'s',name:'做臉',category:'保養',duration:60,buffer:15,price:1000,trialPrice:500,revision:3,active:true};
const data={services:[service,{...service,id:'inactive',name:'停用服務',active:false}],plans:[{id:'p',name:'七次方案',sessions:7,validDays:80,price:6000,active:true,serviceIds:['s']}],techs:[],locations:[],policy:{}} as unknown as BeautyDashboardData;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.save.mockReset().mockResolvedValue({success:true});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
function mount(node:Parameters<Root['render']>[0]){act(()=>root.render(node));}
function button(name:string){const el=[...document.querySelectorAll('button')].find(b=>b.textContent===name);expect(el, name).toBeTruthy();return el!;}
function set(el:HTMLInputElement|HTMLSelectElement,value:string){const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;act(()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
it('shows single, trial, and plans together and opens each with the correct editor',()=>{
 const edit=vi.fn();mount(h(BeautyChargesList,{data,canEdit:true,onEdit:edit}));expect(host.textContent).toContain('七次方案');expect(host.textContent).toContain('體驗');expect(host.querySelectorAll('table tbody tr')).toHaveLength(3);
 act(()=>button('七次方案').click());expect(edit).toHaveBeenLastCalledWith('plan',expect.objectContaining({id:'p',sessions:7}));
});
it('uses one add entry and does not preset scheme sessions',()=>{
 const edit=vi.fn();mount(h(BeautyChargesList,{data,canEdit:true,onEdit:edit}));act(()=>button('＋新增收費方式').click());set(document.querySelector('[role="dialog"] select') as HTMLSelectElement,'plan');act(()=>button('繼續').click());expect(edit).toHaveBeenLastCalledWith('plan');expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it.each(['single','trial'] as const)('editing %s pricing preserves the other price and service metadata',async pricingType=>{
 mount(h(BeautyCatalogEditor,{kind:'pricing',data,draft:{...service,pricingType},onClose:vi.fn(),onSaved:vi.fn()}));
 const target=pricingType==='single'?'price':'trialPrice',other=pricingType==='single'?'trialPrice':'price';expect(document.querySelector(`[name="${other}"]`)).toBeNull();set(document.querySelector(`[name="${target}"]`) as HTMLInputElement,'750');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save).toHaveBeenCalledWith('service',expect.objectContaining({...service,price:pricingType==='single'?750:1000,trialPrice:pricingType==='trial'?750:500}));
});
it('saves arbitrary plan sessions and price and omits inactive services when creating',async()=>{
 mount(h(BeautyCatalogEditor,{kind:'plan',data,onClose:vi.fn(),onSaved:vi.fn()}));expect(document.querySelector<HTMLInputElement>('[name="sessions"]')!.value).toBe('');expect(host.textContent).not.toContain('停用服務');
 for(const [name,value] of Object.entries({name:'九次方案',sessions:'9',price:'8300',validDays:'77'}))set(document.querySelector(`[name="${name}"]`) as HTMLInputElement,value);
 const serviceLabel=[...document.querySelectorAll('label')].find(l=>l.textContent?.trim()==='做臉')!;act(()=>(serviceLabel.querySelector('input') as HTMLInputElement).click());
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save).toHaveBeenCalledWith('plan',expect.objectContaining({name:'九次方案',sessions:9,price:8300,validDays:77,serviceIds:['s']}));
});
it('collapses sharing and preserves checked members while searching and the owner without a checkbox',()=>{
 mount(h('form',{},h(BeautySharedMembers,{ownerId:'buyer',memberIds:['buyer','family'],customers:[{id:'buyer',name:'購買人'},{id:'family',name:'家人'},{id:'other',name:'其他顧客'}]})));
 expect(host.querySelector('details')!.open).toBe(false);expect(host.querySelector('input[type="checkbox"][value="buyer"]')).toBeNull();
 act(()=>{host.querySelector('details')!.open=true;});set(host.querySelector('input[aria-label="搜尋共用成員"]') as HTMLInputElement,'其他');
 expect(new FormData(host.querySelector('form')!).getAll('memberIds')).toEqual(['buyer','family']);
});
