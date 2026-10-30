// @vitest-environment jsdom
import {act,createElement as h,lazy,Suspense,useState,type ComponentType} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),collect:vi.fn(),saved:vi.fn(),gate:null as Promise<void>|null}));
vi.mock('next/dynamic',()=>({default:(load:()=>Promise<ComponentType>,options:{loading:ComponentType})=>{
 const Draft=lazy(async()=>{await m.gate;return {default:await load()};});return (props:object)=>h(Suspense,{fallback:h(options.loading)},h(Draft,props));
}}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/beauty',()=>({readBeautyCollection:m.read,collectBeautyPayment:m.collect}));
vi.mock('@/server/actions/beauty-collection-intent',()=>({prepareBeautyCollectionPurchaseIntent:vi.fn(),readBeautyCollectionPurchaseIntent:vi.fn(),cancelBeautyCollectionPurchaseIntent:vi.fn(),acknowledgeBeautyCollectionPurchaseIntent:vi.fn()}));
import {BeautyCollectionDialog} from '@/components/beauty/collection-dialog';
let host:HTMLDivElement,root:Root;
const guard=()=>{};
function Screen(){const [open,setOpen]=useState(true);return h('div',null,h('button',{id:'roster-row'},'原預約名單'),open?h(BeautyCollectionDialog,{ids:['qa'],storeId:'store',canDiscount:false,onClose:()=>setOpen(false),onSaved:m.saved,onGuard:guard}):null);}
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();m.gate=null;});
it('opens a stable modal before code or quote arrives; settled completion closes without a save callback or replacing the roster',async()=>{
 let code!:()=>void,quote!:(value:unknown)=>void;m.gate=new Promise(r=>{code=r;});m.read.mockImplementation(()=>new Promise(r=>{quote=r;}));
 await act(async()=>root.render(h(Screen)));const dialog=document.querySelector('[role=dialog]'),row=document.querySelector('#roster-row');
 expect(dialog).not.toBeNull();expect(dialog?.textContent).toContain('正在讀取收款資料');expect(m.read).not.toHaveBeenCalled();
 await act(async()=>{code();await import('@/components/beauty/collection-panel');await new Promise(r=>setTimeout(r,0));});expect(document.querySelector('[role=dialog]')).toBe(dialog);expect(m.read).toHaveBeenCalledOnce();
 await act(async()=>quote({success:true,data:[{id:'qa',revision:1,personName:'QA',serviceName:'QA服務',price:750,discount:{kind:'AMOUNT',value:750},reduction:750,netPrice:0,collected:0,due:0}]}));
 expect(document.body.textContent).toContain('免收款');await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='完成')!.click());
 expect(document.querySelector('[role=dialog]')).toBeNull();expect(document.querySelector('#roster-row')).toBe(row);expect(m.saved).not.toHaveBeenCalled();expect(m.collect).not.toHaveBeenCalled();
});
