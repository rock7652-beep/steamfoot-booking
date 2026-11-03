// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),reader:{read:vi.fn()}}));
vi.mock('@/components/operations/panel-read-cache',()=>({usePanelReader:()=>m.reader}));
import {useBeautyMemberPlanSync} from '@/components/beauty/use-member-plan-sync';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const scope={enabled:true,slug:'shop',storeId:'store',customerId:'customer',scopeKey:'user',revision:'rev',work:false};
const snapshot={storeId:'store',customerId:'customer',scopeKey:'user',cards:[{id:'card',name:'方案',remaining:5,held:0,expiresAt:'2090-01-01T00:00:00Z',closed:false}],purchases:[]};
function Harness(props:typeof scope){const s=useBeautyMemberPlanSync(props);return h('div',null,h('p',{id:'issue'},s.issue),h('p',{id:'cards'},s.snapshot?.cards.length??0),h('button',{onClick:s.retry},'retry'));}
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.useFakeTimers();m.reader.read.mockReset();m.reader.read.mockResolvedValue({success:true,data:snapshot});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();});
it('reads on entry, then at most every ten seconds while active',async()=>{await act(async()=>root.render(h(Harness,scope)));expect(m.reader.read).toHaveBeenCalledTimes(1);expect(host.querySelector('#cards')?.textContent).toBe('1');await act(async()=>vi.advanceTimersByTimeAsync(9999));expect(m.reader.read).toHaveBeenCalledTimes(1);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(2);await act(async()=>root.render(h(Harness,{...scope,enabled:false})));await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(m.reader.read).toHaveBeenCalledTimes(2);});
it('retains current data for transient failures and hides it on access denial until reauthorized',async()=>{await act(async()=>root.render(h(Harness,scope)));m.reader.read.mockResolvedValueOnce({success:false,denied:false});await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(host.querySelector('#issue')?.textContent).toBe('network');expect(host.querySelector('#cards')?.textContent).toBe('1');m.reader.read.mockResolvedValueOnce({success:false,denied:true});await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(host.querySelector('#issue')?.textContent).toBe('denied');expect(host.querySelector('#cards')?.textContent).toBe('0');m.reader.read.mockRejectedValueOnce(Error('offline'));await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(host.querySelector('#issue')?.textContent).toBe('denied');expect(host.querySelector('#cards')?.textContent).toBe('0');});
it('does not apply a late response after the identity changes',async()=>{let release!:(value:unknown)=>void;m.reader.read.mockReturnValueOnce(new Promise(resolve=>release=resolve));m.reader.read.mockResolvedValueOnce({success:true,data:{...snapshot,customerId:'other',cards:[]}});await act(async()=>root.render(h(Harness,scope)));await act(async()=>root.render(h(Harness,{...scope,customerId:'other'})));await act(async()=>release({success:true,data:snapshot}));expect(host.querySelector('#cards')?.textContent).toBe('0');expect(m.reader.read).toHaveBeenLastCalledWith('shop','store','other','user');});
it('does not poll hidden tabs and checks once when the tab becomes visible',async()=>{let hidden=true;vi.spyOn(document,'visibilityState','get').mockImplementation(()=>hidden?'hidden':'visible');await act(async()=>root.render(h(Harness,scope)));await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(m.reader.read).not.toHaveBeenCalled();hidden=false;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(m.reader.read).toHaveBeenCalledTimes(1);});
it('refreshes after returning while an older request is in flight, without displaying its stale result',async()=>{
 let hidden=false,release!:(value:unknown)=>void;vi.spyOn(document,'visibilityState','get').mockImplementation(()=>hidden?'hidden':'visible');
 m.reader.read.mockReturnValueOnce(new Promise(resolve=>release=resolve)).mockResolvedValueOnce({success:true,data:snapshot});
 await act(async()=>root.render(h(Harness,scope)));
 hidden=true;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
 hidden=false;await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
 expect(m.reader.read).toHaveBeenCalledTimes(1);
 await act(async()=>release({success:true,data:{...snapshot,cards:[]}}));
 expect(m.reader.read).toHaveBeenCalledTimes(2);expect(host.querySelector('#cards')?.textContent).toBe('1');
 await act(async()=>vi.advanceTimersByTimeAsync(9999));expect(m.reader.read).toHaveBeenCalledTimes(2);
});
it('ignores an in-flight update when a modal disables synchronization',async()=>{let release!:(value:unknown)=>void;m.reader.read.mockReturnValueOnce(new Promise(resolve=>release=resolve));await act(async()=>root.render(h(Harness,scope)));await act(async()=>root.render(h(Harness,{...scope,enabled:false})));await act(async()=>release({success:true,data:snapshot}));expect(host.querySelector('#cards')?.textContent).toBe('0');});
it('temporarily accelerates only while a newly observed application is pending, then returns to the normal cadence',async()=>{
 const pending={...snapshot,purchases:[{id:'order-1',status:'PENDING',createdAt:'2090-01-01T00:00:00Z'}]};m.reader.read.mockResolvedValue({success:true,data:pending});
 await act(async()=>root.render(h(Harness,scope)));await act(async()=>vi.advanceTimersByTimeAsync(59_999));expect(m.reader.read).toHaveBeenCalledTimes(30);
 await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(31);
 await act(async()=>vi.advanceTimersByTimeAsync(9_999));expect(m.reader.read).toHaveBeenCalledTimes(31);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(32);
 // Closing/reopening a modal does not restart the short window for an old order.
 await act(async()=>root.render(h(Harness,{...scope,enabled:false})));await act(async()=>root.render(h(Harness,scope)));expect(m.reader.read).toHaveBeenCalledTimes(33);
 await act(async()=>vi.advanceTimersByTimeAsync(2_000));expect(m.reader.read).toHaveBeenCalledTimes(33);
});
it('backs off failures even while pending and never overlaps an in-flight read',async()=>{
 const pending={...snapshot,purchases:[{id:'order-2',status:'PENDING',createdAt:'2090-01-01T00:00:00Z'}]};m.reader.read.mockResolvedValueOnce({success:true,data:pending}).mockResolvedValueOnce({success:false,denied:false}).mockRejectedValueOnce(Error('offline'));
 await act(async()=>root.render(h(Harness,scope)));await act(async()=>vi.advanceTimersByTimeAsync(2_000));expect(m.reader.read).toHaveBeenCalledTimes(2);
 await act(async()=>vi.advanceTimersByTimeAsync(9_999));expect(m.reader.read).toHaveBeenCalledTimes(2);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(3);
 await act(async()=>vi.advanceTimersByTimeAsync(19_999));expect(m.reader.read).toHaveBeenCalledTimes(3);
 let release!:(value:unknown)=>void;m.reader.read.mockReturnValueOnce(new Promise(resolve=>release=resolve));await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(4);
 await act(async()=>vi.advanceTimersByTimeAsync(60_000));expect(m.reader.read).toHaveBeenCalledTimes(4);await act(async()=>release({success:true,data:pending}));
});
it('stops the short cadence when the application is no longer pending',async()=>{
 const pending={...snapshot,purchases:[{id:'order-3',status:'PENDING',createdAt:'2090-01-01T00:00:00Z'}]};m.reader.read.mockResolvedValueOnce({success:true,data:pending}).mockResolvedValue({success:true,data:{...snapshot,purchases:[{id:'order-3',status:'CONFIRMED',createdAt:'2090-01-01T00:00:00Z'}]}});
 await act(async()=>root.render(h(Harness,scope)));await act(async()=>vi.advanceTimersByTimeAsync(2_000));expect(m.reader.read).toHaveBeenCalledTimes(2);
 await act(async()=>vi.advanceTimersByTimeAsync(9_999));expect(m.reader.read).toHaveBeenCalledTimes(2);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(m.reader.read).toHaveBeenCalledTimes(3);
});
it('starts a new short window when a distinct pending order is observed later',async()=>{
 const pending=(id:string)=>({...snapshot,purchases:[{id,status:'PENDING',createdAt:'2090-01-01T00:00:00Z'}]});
 m.reader.read.mockResolvedValue({success:true,data:pending('first')});await act(async()=>root.render(h(Harness,scope)));await act(async()=>vi.advanceTimersByTimeAsync(60_000));expect(m.reader.read).toHaveBeenCalledTimes(31);
 m.reader.read.mockResolvedValue({success:true,data:pending('second')});await act(async()=>vi.advanceTimersByTimeAsync(10_000));expect(m.reader.read).toHaveBeenCalledTimes(32);
 await act(async()=>vi.advanceTimersByTimeAsync(2_000));expect(m.reader.read).toHaveBeenCalledTimes(33);
});
