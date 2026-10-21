// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn(),book:vi.fn(),slots:vi.fn(),plan:vi.fn(),status:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push,refresh:m.refresh,replace:vi.fn()}),usePathname:()=>'/s/test/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/beauty',()=>({bookBeautyParty:m.book,submitBeautyTrial:m.book,readBeautySlots:m.slots,requestBeautyPlan:m.plan,changeBeautyStatus:m.status}));
vi.mock('@/server/actions/auth',()=>({logoutAction:vi.fn()}));
vi.mock('@/components/image-announcements/carousel',()=>({StoreImageAnnouncements:()=>null}));
vi.mock('@/components/beauty/reschedule-panel',()=>({BeautyReschedulePanel:({onSaved}:{onSaved:()=>void})=>h('button',{onClick:onSaved},'模擬改期成功')}));
import {BeautyBookingForm} from '@/components/beauty/booking-form';
import {BeautyPortal} from '@/components/beauty/portal';
import type {BeautyPortalData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:{root:ReturnType<typeof createRoot>;host:HTMLDivElement}[]=[];
function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});act(()=>root.render(node));return host;}
function button(host:HTMLElement,name:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);if(!b)throw new Error('Missing '+name);return b;}
function field(host:HTMLElement,name:string){const label=[...host.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(name));if(!label)throw new Error('Missing '+name);return label.querySelector('input,select,textarea') as HTMLInputElement|HTMLSelectElement;}
function set(el:HTMLInputElement|HTMLSelectElement,value:string){act(()=>{const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const catalog={services:[{id:'service',name:'做臉',duration:60,price:1000,trialPrice:500}],techs:[]};
const data={...catalog,store:{id:'store',slug:'test',name:'測試店'},canWork:true,work:false,customer:{id:'person',name:'顧客',phone:'0900000000'},cards:[],members:[],items:[],plans:[],purchases:[],grants:[],income:[],bank:null,policy:{selfBooking:true,selfCancel:true,selfReschedule:true}} as unknown as BeautyPortalData;
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-21T02:00:00Z'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});m.plan.mockResolvedValue({success:true});m.status.mockResolvedValue({success:true});m.slots.mockResolvedValue({success:true,data:{slots:['09:00','10:00']}});});
afterEach(()=>{for(const {root,host}of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.restoreAllMocks();vi.useRealTimers();});
it('starts on the selected calendar date, validates a seeded time against fresh slots',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'10:00',customer:data.customer}));
 expect(field(host,'共同日期').value).toBe('2026-10-27');set(field(host,'技師性別'),'FEMALE');await act(async()=>button(host,'查詢共同可用時間').click());
 expect(m.slots.mock.calls[0][2].date).toBe('2026-10-27');expect(field(host,'共同開始時間').value).toBe('10:00');expect(m.book).not.toHaveBeenCalled();
});
it('does not accept a seeded time absent from the authoritative slot response',async()=>{
 const host=mount(h(BeautyBookingForm,{catalog,mode:'manager',slug:'test',initialDate:'2026-10-27',initialTime:'12:00',customer:data.customer}));set(field(host,'技師性別'),'FEMALE');await act(async()=>button(host,'查詢共同可用時間').click());expect(field(host,'共同開始時間').value).toBe('');
});
it('keeps a multi-person draft when visiting another member page and returning',()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(field(host,'預約人數'),'2');const notes=host.querySelectorAll('input[maxlength="1000"]');set(notes[0] as HTMLInputElement,'保留第一人');set(notes[1] as HTMLInputElement,'保留第二人');set(field(host,'共同日期'),'2026-10-27');act(()=>button(host,'我的').click());act(()=>button(host,'預約').click());expect(field(host,'預約人數').value).toBe('2');expect((notes[0] as HTMLInputElement).value).toBe('保留第一人');expect(field(host,'共同日期').value).toBe('2026-10-27');
});
it('asks before dropping a draft through an identity switch',()=>{
 const host=mount(h(BeautyPortal,{data}));act(()=>button(host,'立即預約').click());set(field(host,'本次備註'),'未送出');const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);act(()=>button(host,'我的工作').click());expect(confirm).toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
});

it('uses a guarded bank transfer sheet instead of a browser prompt',async()=>{
 const withPlan={...data,bank:{bankName:'測試銀行',bankCode:'000',bankAccountNumber:'12345678'},plans:[{id:'plan',name:'五次方案',sessions:5,price:4500}]} as BeautyPortalData;
 const host=mount(h(BeautyPortal,{data:withPlan}));act(()=>button(host,'我的').click());act(()=>button(host,'我的方案 →').click());act(()=>button(host,'購買方案').click());act(()=>button(host,'購買方案').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;expect(sheet).not.toBeNull();set(field(sheet,'轉出帳號後四碼'),'123');expect(button(sheet,'已匯款，送出核帳資料').disabled).toBe(true);set(field(sheet,'轉出帳號後四碼'),'1234');await act(async()=>button(sheet,'已匯款，送出核帳資料').click());expect(m.plan).toHaveBeenCalledOnce();expect(m.plan.mock.calls[0][0]).toMatchObject({planId:'plan',lastFour:'1234'});expect(host.textContent).toContain('核帳資料已送出');
});
it('groups companions but cancels only the selected service item through the confirmation sheet',async()=>{
 const item={startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,technicianId:'tech',cancelDeduct:false,noShowDeduct:false,notes:'',preference:'ANY',price:1000,isTrial:false,customerId:'person'};
 const withParty={...data,items:[{...item,id:'one',personName:'本人',serviceName:'做臉'},{...item,id:'two',personName:'同行者',serviceName:'按摩'}]} as BeautyPortalData;
 const host=mount(h(BeautyPortal,{data:withParty}));act(()=>button(host,'我的預約').click());expect(host.querySelectorAll('.cp-booking-card')).toHaveLength(1);act(()=>button(host,'查看明細 ⌄').click());const cancellations=[...host.querySelectorAll('button')].filter(b=>b.textContent==='取消預約');act(()=>cancellations[1].click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;set(field(sheet,'原因'),'只取消同行者');await act(async()=>button(sheet,'確認').click());expect(m.status).toHaveBeenCalledOnce();expect(m.status.mock.calls[0]).toMatchObject(['member',{id:'two',target:'CANCELLED',reason:'只取消同行者'}]);
});
it('hides customer cancellation and rescheduling when store policy disables them',()=>{
 const item={id:'one',startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,personName:'本人',serviceName:'做臉',technicianId:'tech',cancelDeduct:false,noShowDeduct:false};
 const host=mount(h(BeautyPortal,{data:{...data,policy:{...data.policy,selfCancel:false,selfReschedule:false},items:[item]} as BeautyPortalData}));act(()=>button(host,'我的預約').click());act(()=>button(host,'查看明細 ⌄').click());expect([...host.querySelectorAll('button')].some(b=>b.textContent==='取消預約'||b.textContent==='改期')).toBe(false);
});
it('uses the selected worker item and revision when correcting a completed service',async()=>{
 const item={id:'worker-item',startsAt:'2026-10-20T01:00:00Z',endsAt:'2026-10-20T02:00:00Z',status:'COMPLETED',groupId:'group',revision:3,personName:'本人',serviceName:'做臉',technicianId:'tech',cancelDeduct:false,noShowDeduct:false};
 const host=mount(h(BeautyPortal,{data:{...data,work:true,grants:['complete'],items:[item]} as BeautyPortalData}));act(()=>button(host,'服務紀錄').click());act(()=>button(host,'查看明細 ⌄').click());act(()=>button(host,'更正回預約').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;set(field(sheet,'原因'),'更正誤按');await act(async()=>button(sheet,'確認').click());expect(m.status.mock.calls[0]).toMatchObject(['work',{id:'worker-item',revision:3,target:'RESERVED',reason:'更正誤按'}]);
});

it('blocks the next action after rescheduling until fresh authoritative props arrive',async()=>{
 const item={id:'moving',startsAt:'2026-10-27T01:00:00Z',endsAt:'2026-10-27T02:00:00Z',status:'RESERVED',groupId:'group',revision:0,personName:'本人',serviceName:'做臉',technicianId:'tech',cancelDeduct:false,noShowDeduct:false};
 const first={...data,items:[item]} as BeautyPortalData;const host=mount(h(BeautyPortal,{data:first}));act(()=>button(host,'我的預約').click());act(()=>button(host,'查看明細 ⌄').click());act(()=>button(host,'改期').click());act(()=>button(host,'模擬改期成功').click());expect(m.refresh).toHaveBeenCalledOnce();expect(button(host,'取消預約').disabled).toBe(true);expect(host.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
 const fresh={...first,items:[{...item,revision:1,startsAt:'2026-10-28T01:00:00Z'}]} as BeautyPortalData;act(()=>roots[0].root.render(h(BeautyPortal,{data:fresh})));expect(button(host,'取消預約').disabled).toBe(false);act(()=>button(host,'取消預約').click());const sheet=host.querySelector('[role="dialog"]') as HTMLElement;set(field(sheet,'原因'),'更新後取消');await act(async()=>button(sheet,'確認').click());expect(m.status.mock.calls[0]).toMatchObject(['member',{id:'moving',revision:1}]);
});
