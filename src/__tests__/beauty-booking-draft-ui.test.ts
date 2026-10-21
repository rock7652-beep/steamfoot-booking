// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn(),book:vi.fn(),slots:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push,refresh:m.refresh})}));
vi.mock('@/server/actions/beauty',()=>({bookBeautyParty:m.book,submitBeautyTrial:m.book,readBeautySlots:m.slots,requestBeautyPlan:vi.fn(),changeBeautyStatus:vi.fn()}));
vi.mock('@/server/actions/auth',()=>({logoutAction:vi.fn()}));
vi.mock('@/components/image-announcements/carousel',()=>({StoreImageAnnouncements:()=>null}));
vi.mock('@/components/beauty/reschedule-panel',()=>({BeautyReschedulePanel:()=>null}));
import {BeautyBookingForm} from '@/components/beauty/booking-form';
import {BeautyPortal} from '@/components/beauty/portal';
import type {BeautyPortalData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{root:ReturnType<typeof createRoot>;host:HTMLDivElement}[]=[];
function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});act(()=>root.render(node));return host;}
function button(host:HTMLElement,name:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);if(!b)throw new Error('Missing '+name);return b;}
function field(host:HTMLElement,name:string){const label=[...host.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(name));if(!label)throw new Error('Missing '+name);return label.querySelector('input,select') as HTMLInputElement|HTMLSelectElement;}
function set(el:HTMLInputElement|HTMLSelectElement,value:string){act(()=>{const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const catalog={services:[{id:'service',name:'做臉',duration:60,price:1000,trialPrice:500}],techs:[]};
const data={...catalog,store:{id:'store',slug:'test',name:'測試店'},canWork:true,work:false,customer:{id:'person',name:'顧客',phone:'0900000000'},cards:[],members:[],items:[],plans:[],purchases:[],grants:[],income:[],bank:null} as unknown as BeautyPortalData;
beforeEach(()=>{vi.clearAllMocks();m.slots.mockResolvedValue({success:true,data:{slots:['09:00','10:00']}});});
afterEach(()=>{for(const {root,host}of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.restoreAllMocks();});
it('starts on the selected calendar date, validates a seeded time against fresh slots',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'10:00',customer:data.customer}));
 expect(field(host,'共同日期').value).toBe('2026-10-27');set(field(host,'技師性別'),'FEMALE');await act(async()=>button(host,'查詢共同可用時間').click());
 expect(m.slots.mock.calls[0][2].date).toBe('2026-10-27');expect(field(host,'共同開始時間').value).toBe('10:00');expect(m.book).not.toHaveBeenCalled();
});
it('does not accept a seeded time absent from the authoritative slot response',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'12:00',customer:data.customer}));set(field(host,'技師性別'),'FEMALE');await act(async()=>button(host,'查詢共同可用時間').click());expect(field(host,'共同開始時間').value).toBe('');
});
it('keeps a multi-person draft when visiting another member page and returning',()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(field(host,'預約人數'),'2');const notes=host.querySelectorAll('input[maxlength="1000"]');set(notes[0] as HTMLInputElement,'保留第一人');set(notes[1] as HTMLInputElement,'保留第二人');set(field(host,'共同日期'),'2026-10-27');act(()=>button(host,'帳戶').click());act(()=>button(host,'立即預約').click());expect(field(host,'預約人數').value).toBe('2');expect((notes[0] as HTMLInputElement).value).toBe('保留第一人');expect(field(host,'共同日期').value).toBe('2026-10-27');
});
it('asks before dropping a draft through an identity switch',()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(field(host,'本次備註'),'未送出');const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);act(()=>button(host,'我的工作').click());expect(confirm).toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
});
