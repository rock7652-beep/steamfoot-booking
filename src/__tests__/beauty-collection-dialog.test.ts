// @vitest-environment jsdom
import {act,createElement as h,lazy,Suspense,useState,type ComponentType} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),collect:vi.fn(),saved:vi.fn(),gate:null as Promise<void>|null}));
vi.mock('next/dynamic',()=>({default:(load:()=>Promise<ComponentType>,options:{loading:ComponentType})=>{
 const Draft=lazy(async()=>{await m.gate;return {default:await load()};});return (props:object)=>h(Suspense,{fallback:h(options.loading)},h(Draft,props));
}}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/lib/beauty/collection-reader',()=>({readBeautyCollectionQuote:(ids:unknown)=>m.read(ids),readBeautyCollectionStatus:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({readBeautyCollection:m.read,collectBeautyPayment:m.collect}));
vi.mock('@/server/actions/beauty-collection-intent',()=>({prepareBeautyCollectionPurchaseIntent:vi.fn(),readBeautyCollectionPurchaseIntent:vi.fn(),cancelBeautyCollectionPurchaseIntent:vi.fn(),acknowledgeBeautyCollectionPurchaseIntent:vi.fn()}));
import {BeautyCollectionDialog} from '@/components/beauty/collection-dialog';
let host:HTMLDivElement,root:Root;
const guard=()=>{};
function Screen(){const [open,setOpen]=useState(true);return h('div',null,h('button',{id:'roster-row'},'原預約名單'),open?h(BeautyCollectionDialog,{ids:['qa'],storeId:'store',canDiscount:false,onClose:()=>setOpen(false),onSaved:m.saved,onGuard:guard}):null);}
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();m.gate=null;});
it('opens the collection fields directly while the quote loads; settled completion closes without a save callback or replacing the roster',async()=>{
 let code!:()=>void,quote!:(value:unknown)=>void;m.gate=new Promise(r=>{code=r;});m.read.mockImplementation(()=>new Promise(r=>{quote=r;}));
 await act(async()=>root.render(h(Screen)));const dialog=document.querySelector('[role=dialog]'),row=document.querySelector('#roster-row');
 expect(dialog).not.toBeNull();expect(dialog?.textContent).not.toContain('核對應收');expect(dialog?.querySelector('[aria-label="本次收款"]')).not.toBeNull();expect(dialog?.querySelector('[aria-label="付款方式"]')).not.toBeNull();expect(dialog?.querySelector<HTMLInputElement>('[aria-label="本次收款"]')?.disabled).toBe(true);expect(m.read).toHaveBeenCalledOnce();
 await act(async()=>{code();await import('@/components/beauty/collection-panel');await new Promise(r=>setTimeout(r,0));});expect(document.querySelector('[role=dialog]')).toBe(dialog);expect(m.read).toHaveBeenCalledOnce();
 await act(async()=>quote({success:true,data:[{id:'qa',revision:1,personName:'QA',serviceName:'QA服務',price:750,discount:{kind:'AMOUNT',value:750},reduction:750,netPrice:0,collected:0,due:0}]}));
 expect(document.body.textContent).toContain('免收款');await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='完成')!.click());
 expect(document.querySelector('[role=dialog]')).toBeNull();expect(document.querySelector('#roster-row')).toBe(row);expect(m.saved).not.toHaveBeenCalled();expect(m.collect).not.toHaveBeenCalled();
});

it('keeps collection disabled during a slow or failed quote and never submits unverified amounts',async()=>{
 let quote!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(r=>{quote=r;}));await act(async()=>root.render(h(Screen)));
 const dialog=document.querySelector('[role=dialog]');const submit=dialog!.querySelector<HTMLButtonElement>('button[type="submit"]')!;expect(submit.disabled).toBe(true);
 await act(async()=>dialog!.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.collect).not.toHaveBeenCalled();
 await act(async()=>quote({success:false,error:'連線失敗'}));expect(document.querySelector('[role=dialog]')).toBe(dialog);expect(document.querySelector('[role=alert]')?.textContent).toContain('連線失敗');expect(submit.disabled).toBe(true);
});

it('shows the roster quote immediately, keeps the payment method through refresh, and uses prepared quotes while retaining background verification',async()=>{
 let finish!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const charge={id:'qa',revision:1,personName:'QA',serviceName:'QA服務',price:750,discount:{kind:'AMOUNT' as const,value:0},reduction:0,netPrice:750,collected:250,due:500};
 await act(async()=>root.render(h(BeautyCollectionDialog,{ids:['qa'],storeId:'store',initialCharges:[charge],canDiscount:false,onClose:()=>{},onSaved:m.saved,onGuard:guard})));
 const dialog=document.querySelector('[role=dialog]')!;expect(dialog.textContent).toContain('QA服務');expect(dialog.textContent).toContain('已收款 NT$ 250');expect(dialog.querySelector<HTMLInputElement>('[aria-label="本次收款 QA"]')?.value).toBe('500');
 const method=dialog.querySelector<HTMLSelectElement>('[name="method"]')!;expect(method.disabled).toBe(false);await act(async()=>{method.value='BANK_TRANSFER';method.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(dialog.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
 await act(async()=>finish({success:true,data:[charge]}));expect(dialog.querySelector('[name="method"]')).toBe(method);expect(method.value).toBe('BANK_TRANSFER');expect(dialog.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
});
it('does not overwrite edited inputs or allow collection when a refreshed quote changes',async()=>{
 let finish!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const charge={id:'qa',revision:1,personName:'QA',serviceName:'QA服務',price:750,discount:{kind:'AMOUNT' as const,value:0},reduction:0,netPrice:750,collected:0,due:750};
 await act(async()=>root.render(h(BeautyCollectionDialog,{ids:['qa'],storeId:'store',initialCharges:[charge],canDiscount:false,onClose:()=>{},onSaved:m.saved,onGuard:guard})));
 const amount=document.querySelector<HTMLInputElement>('[aria-label="本次收款 QA"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(amount,'200');amount.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>finish({success:true,data:[{...charge,collected:100,due:650}]}));expect(amount.value).toBe('200');expect(document.body.textContent).toContain('收款資料已更新');expect(document.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);await act(async()=>{amount.dispatchEvent(new Event('change',{bubbles:true}));});expect(document.body.textContent).toContain('收款資料已更新');expect(m.collect).not.toHaveBeenCalled();
});
