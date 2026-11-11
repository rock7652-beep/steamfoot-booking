// @vitest-environment jsdom
import {act,createElement as el} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
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
