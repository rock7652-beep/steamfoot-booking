// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),move:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({readBeautyMoveSlots:m.read,moveBeautyAppointment:m.move}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:{children:React.ReactNode})=>h('div',{role:'dialog'},children)}));
import {BeautyReschedulePanel} from '@/components/beauty/reschedule-panel';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{host:HTMLDivElement;root:ReturnType<typeof createRoot>}[]=[];
const item={id:'own',revision:3,serviceName:'做臉',personName:'顧客',startsAt:'2026-10-24T01:00:00Z',endsAt:'2026-10-24T02:00:00Z'};
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({host,root});const saved=vi.fn();await act(async()=>root.render(h(BeautyReschedulePanel,{mode:'member',item,onClose:vi.fn(),onSaved:saved})));return {host,saved};}
function button(host:HTMLElement,text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw Error('Missing '+text);return b;}
function date(host:HTMLElement,value:string){const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({success:true,data:{slots:['09:00','09:30']}});m.move.mockResolvedValue({success:true});});
afterEach(()=>{for(const {host,root}of roots.splice(0)){act(()=>root.unmount());host.remove();}});
it('loads on opening and exposes time buttons directly with a full range',async()=>{const {host,saved}=await mount();expect(m.read).toHaveBeenCalledWith('member',{id:'own',date:'2026-10-24'});expect(host.querySelector('select')).toBeNull();expect(host.textContent).not.toContain('查詢可用時間');act(()=>button(host,'09:30').click());expect(host.textContent).toContain('09:30–10:30');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(saved).toHaveBeenCalledOnce();expect(m.move.mock.calls[0]).toMatchObject(['member',{id:'own',revision:3,date:'2026-10-24',time:'09:30'}]);});
it('automatically reloads a changed date and ignores a late result from the previous date',async()=>{let late!:(v:unknown)=>void;m.read.mockReturnValueOnce(new Promise(r=>{late=r;})).mockResolvedValueOnce({success:true,data:{slots:['14:00']}});const {host}=await mount();await act(async()=>date(host,'2026-10-25'));expect(host.textContent).toContain('14:00');await act(async()=>late({success:true,data:{slots:['09:00']}}));expect([...host.querySelectorAll('button')].some(b=>b.textContent==='09:00')).toBe(false);expect(button(host,'確認改期').disabled).toBe(true);});
it('preserves the selected time and request key when retrying a failed save',async()=>{m.move.mockResolvedValueOnce({success:false,error:'請重試'});const {host}=await mount();act(()=>button(host,'09:00').click());await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));const key=m.move.mock.calls[0][1].requestKey;expect(host.textContent).toContain('請重試');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.move.mock.calls[1][1].requestKey).toBe(key);});
