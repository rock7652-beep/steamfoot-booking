// @vitest-environment jsdom
import {act,useEffect,createElement as el} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/beauty',useSearchParams:()=>new URLSearchParams()}));
import {useBeautyNativePlanProgressReader} from '@/components/beauty/use-native-plan-progress-reader';
import {PanelReadProvider,useInvalidateCustomerPlanReads} from '@/components/operations/panel-read-cache';
import {BeautyPlanProgress} from '@/components/beauty/plan-progress';
let host:HTMLDivElement,root:Root;
const reply=(name='孩子甲',date='2026-11-03T02:00:00Z')=>({success:true as const,data:{progress:{available:true as const,total:10,completed:[{id:'used',date,customerName:name}],voided:[{id:'void',date:'2026-11-10T16:00:00Z'}]},purchasedAt:'2026-10-01T02:00:00Z',price:5000,shared:true}});
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('renders one shared grid, centered dates, void date and purchase facts without exposing management controls',async()=>{
 const load=vi.fn().mockResolvedValue(reply());await act(async()=>root.render(el(BeautyPlanProgress,{cardId:'card',scope:'member:a',slug:'shop',load})));
 expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.querySelectorAll('[data-completed=true]')).toHaveLength(1);expect(host.querySelectorAll('[data-voided=true]')[0].textContent).toBe('註銷11/11');
 expect([...host.querySelectorAll('[data-lesson-slot]')].filter(r=>!r.textContent)).toHaveLength(8);expect(host.textContent).toContain('2026-10-01');expect(host.textContent).toContain('5,000');expect(host.textContent).toContain('共用');expect(host.textContent).not.toContain('補登');
 await act(async()=>host.querySelector<HTMLButtonElement>('[data-completed=true] button')!.click());expect(host.textContent).toContain('孩子甲');
});
it('drops old customer dates immediately and ignores their late response',async()=>{
 let finish!:(v:ReturnType<typeof reply>)=>void;const old=vi.fn().mockReturnValue(new Promise(resolve=>{finish=resolve;})),current=vi.fn().mockResolvedValue(reply('孩子乙','2026-11-04T02:00:00Z'));
 await act(async()=>root.render(el(BeautyPlanProgress,{cardId:'old',scope:'store:a',slug:'a',load:old})));
 await act(async()=>root.render(el(BeautyPlanProgress,{cardId:'new',scope:'store:b',slug:'b',load:current})));
 await act(async()=>finish(reply('孩子甲')));expect(host.querySelector('[data-completed=true]')?.textContent).toBe('11/04');expect(host.textContent).not.toContain('11/03');
});
it('shows a failed revalidation and retries rather than leaving a stale grid visible',async()=>{
 const load=vi.fn().mockResolvedValue(reply());await act(async()=>root.render(el(BeautyPlanProgress,{cardId:'card',scope:'a',slug:'shop',load})));
 load.mockResolvedValueOnce({success:false,error:'會員權限已變更'});await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(0);expect(host.textContent).toContain('會員權限已變更');
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);
});

it('refreshes corrected dates even when the remaining balance is unchanged',async()=>{
 const load=vi.fn().mockResolvedValue(reply());await act(async()=>root.render(el(BeautyPlanProgress,{cardId:'card',scope:'a',slug:'shop',load})));
 load.mockResolvedValue(reply('孩子甲','2026-11-05T02:00:00Z'));await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.querySelector('[data-completed=true]')?.textContent).toBe('11/05');expect(host.textContent).not.toContain('11/03');
});

it('reuses a native background read on open and invalidates it after a plan change',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>reply()});vi.stubGlobal('fetch',fetcher);
 let reader!:ReturnType<typeof useBeautyNativePlanProgressReader>,invalidate!:()=>void;
 function Harness({open,customer='a',revision=0}:{open:boolean;customer?:string;revision?:number}){
  const value=useBeautyNativePlanProgressReader('store'),clear=useInvalidateCustomerPlanReads();
  useEffect(()=>{reader=value;invalidate=clear;},[value,clear]);
  return open?el(BeautyPlanProgress,{storeId:'store',customerId:customer,cardId:'card',scope:customer,revision}):null;
 }
 const render=async(open:boolean,customer='a',revision=0)=>act(async()=>root.render(el(PanelReadProvider,null,el(Harness,{open,customer,revision}))));
 await render(false);await reader.read('store','a','card',0);expect(fetcher).toHaveBeenCalledOnce();
 await render(true);expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(fetcher).toHaveBeenCalledOnce();
 await render(false);await render(true);expect(fetcher).toHaveBeenCalledOnce();
 await render(true,'b');expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>invalidate());await render(true,'b',1);expect(fetcher).toHaveBeenCalledTimes(3);
});

it('reuses authorized initial member progress without another request when the plans view mounts',async()=>{
 const value=reply();let cached:Parameters<NonNullable<import('@/components/beauty/plan-progress').BeautyProgressReader['seed']>>[0]|undefined;
 const reader={get:vi.fn(()=>cached),seed:vi.fn((v:NonNullable<typeof cached>)=>{cached=v;}),read:vi.fn(async()=>cached!),refresh:vi.fn(async()=>value)};
 await act(async()=>root.render(el(BeautyPlanProgress,{reader,cardId:'card',scope:'member-store-v1',slug:'shop',initialData:value,initialReadAt:Date.now()})));
 expect(reader.seed).toHaveBeenCalledWith(value,'card','shop');expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.textContent).not.toContain('讀取使用紀錄中');expect(reader.refresh).not.toHaveBeenCalled();
});
