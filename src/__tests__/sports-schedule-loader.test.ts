// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {SportsSnapshot} from '@/lib/sports-staging-types';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/sports-schedule-options-client',()=>({readSportsScheduleOptions:m.read}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/s/sports-live-flow/admin/dashboard/courses'}));
vi.mock('@/app/(dashboard)/dashboard/courses/sports-schedule-fields',()=>({SportsScheduleFields:({initial}:{initial:SportsSnapshot})=>{const [draft,setDraft]=useState('');return createElement('div',null,initial.storeId,createElement('input',{value:draft,onChange:e=>setDraft(e.target.value)}));}}));
import {PanelReadProvider,usePanelReader} from '@/components/operations/panel-read-cache';
import {readSportsScheduleOptions} from '@/lib/sports-schedule-options-client';
import {SportsScheduleLoader} from '@/app/(dashboard)/dashboard/courses/sports-schedule-loader';
let root:Root,host:HTMLDivElement;
const data={storeId:'sports-store',customers:[]} as unknown as SportsSnapshot;
const props={scopeVersion:'store:revision',addedCustomers:[],date:'2026-11-27',requestKey:'request',onGuard:vi.fn(),onCreated:vi.fn()};
function Intent(){const reader=usePanelReader('sports-schedule-options',readSportsScheduleOptions,props.scopeVersion,0);return createElement('button',{onFocus:()=>reader.prefetch()},'intent');}
async function render(open=true,initial?:SportsSnapshot,scope=props.scopeVersion){await act(async()=>root.render(createElement(PanelReadProvider,null,createElement(Intent),open?createElement(SportsScheduleLoader,{...props,scopeVersion:scope,initial}):null)));}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.read.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('does not read while closed, shares intent in-flight, and shows loading before metadata',async()=>{
 let resolve!:(value:unknown)=>void;m.read.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 await render(false);expect(m.read).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('button')!.focus());expect(m.read).toHaveBeenCalledOnce();
 await render();expect(host.textContent).toContain('正在讀取排課資料');expect(m.read).toHaveBeenCalledOnce();
 await act(async()=>resolve({success:true,data}));expect(host.textContent).toContain('sports-store');
});
it('retries failure and ignores responses after close; reopening gets fresh metadata',async()=>{
 m.read.mockResolvedValueOnce({success:false,error:'缺少權限'}).mockResolvedValueOnce({success:true,data});
 await render();expect(host.querySelector('[role=alert]')?.textContent).toBe('缺少權限');
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='重新讀取')!.click());expect(host.textContent).toContain('sports-store');
 await render(false);let resolve!:(value:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await render();await render(false);
 await act(async()=>resolve({success:true,data:{...data,storeId:'late'}}));m.read.mockResolvedValueOnce({success:true,data});await render();expect(host.textContent).not.toContain('late');expect(host.textContent).toContain('sports-store');
});
it('uses supplied external data immediately and preserves the mounted draft on server revision changes',async()=>{
 await render(true,data);expect(m.read).not.toHaveBeenCalled();
 const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'未儲存');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await render(true,{...data,storeId:'replacement'},'new-revision');expect(host.querySelector('input')?.value).toBe('未儲存');expect(host.textContent).not.toContain('replacement');expect(m.read).not.toHaveBeenCalled();
});
