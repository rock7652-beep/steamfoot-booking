// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({status:vi.fn(),move:vi.fn(),collect:vi.fn(),push:vi.fn(),refresh:vi.fn(),params:new URLSearchParams()}));
vi.mock('@/server/actions/beauty-customer-attribution',()=>({bulkAssignBeautyCustomers:vi.fn(),saveBeautyCustomerAttribution:vi.fn(),searchBeautyReferrerCandidates:vi.fn()}));
vi.mock('@/server/actions/beauty-display-order',()=>({saveBeautyDisplayOrder:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh,push:m.push}),useSearchParams:()=>m.params,usePathname:()=>'/dashboard/beauty'}));
vi.mock('@/lib/beauty/calendar-read',()=>({readBeautyCalendar:vi.fn(),projectBeautyCalendar:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/customer-list',()=>({CourseCustomerList:()=>null}));
vi.mock('@/server/actions/beauty',()=>({changeBeautyStatus:m.status,linkBeautyCustomer:vi.fn(),confirmBeautyPurchase:vi.fn(),collectBeautyPayment:m.collect,purchaseBeautyPlan:vi.fn(),refundBeautyPayment:vi.fn(),confirmBeautySettlement:vi.fn(),saveBeautyCustomer:vi.fn(),moveBeautyAppointment:m.move}));
vi.mock('@/components/beauty/schedule-workspace',()=>({BeautyScheduleWorkspace:({onOpen}:{onOpen:(id:string)=>void})=>h('button',{onClick:()=>onOpen('a')},'開啟預約')}));
vi.mock('@/components/beauty/customer-panel',()=>({BeautyCustomerPanel:()=>null}));
vi.mock('@/components/beauty/catalog-editor',()=>({BeautyCatalogEditor:()=>null}));
vi.mock('@/components/beauty/native-schedule-source',()=>({BeautyNativeScheduleDialog:()=>null}));
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
import {BeautyDashboard} from '@/components/beauty/dashboard';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const item={id:'a',groupId:'group',personName:'本人',personPhone:'0900000001',customerId:'customer',serviceId:'service',serviceName:'做臉',startsAt:'2026-10-22T01:00:00.000Z',endsAt:'2026-10-22T02:00:00.000Z',occupiedEndsAt:'2026-10-22T02:00:00.000Z',technicianId:'tech',locationId:'room',cardId:'card',price:1000,status:'RESERVED',revision:7,notes:'本次注意事項'};
const data={date:'2026-10-22',month:'2026-10',calendar:'day',now:Date.parse('2026-10-22T00:00:00Z'),store:{id:'store',slug:'test'},items:[item,{...item,id:'b',personName:'同行者',serviceName:'按摩',endsAt:'2026-10-22T02:30:00.000Z'},{...item,id:'other',groupId:'other-group',personName:'另一組'}],cards:[{id:'card',remaining:5,held:3}],customers:[],services:[],plans:[],techs:[{id:'tech',name:'技師',active:true}],locations:[{id:'room',name:'位置',isActive:true}],payments:[],purchases:[],policy:{},access:{planAccess:true,customerAccess:true,financeAccess:true},manage:{update:true,collect:true,customer:false,card:true},calendarDays:{}} as unknown as BeautyDashboardData;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.status.mockReset().mockResolvedValue({success:true});m.move.mockReset().mockResolvedValue({success:true});m.collect.mockReset().mockResolvedValue({success:false,error:"超過應收"});m.push.mockReset();m.refresh.mockReset();m.params=new URLSearchParams();window.history.replaceState(null,"","/dashboard/beauty");});
afterEach(()=>{act(()=>root.unmount());host.remove();});
function button(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===name);expect(b,name).toBeTruthy();return b!;}
async function open(readOnly=false,manage=data.manage){await act(async()=>root.render(h(BeautyDashboard,{data:{...data,manage},tab:'班表',slug:'test',readOnly})));await act(async()=>button('開啟預約').click());}
it('opens the complete party in the shared roster and preserves service duration, available sessions and guarded completion',async()=>{
 await open();const roster=document.querySelector('[aria-label="預約名單捲動區"]')!;expect(roster).toBeTruthy();expect(roster.querySelectorAll('li')).toHaveLength(2);expect(roster.textContent).toContain('同行者');expect(roster.textContent).not.toContain('另一組');expect(roster.textContent).toContain('10:30');expect(roster.textContent).toContain('本次注意事項');expect(roster.textContent).toContain('可用次數');
 await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="本人：已預約"]')!.click());expect(m.status).not.toHaveBeenCalled();expect(document.body.textContent).toContain('確認');
});
it('keeps readonly status and selection disabled and hides all transaction menu actions',async()=>{
 await open(true);expect(document.querySelector<HTMLButtonElement>('button[aria-label="本人：已預約"]')!.disabled).toBe(true);expect(document.querySelector('input[type="checkbox"]')).toBeNull();await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="本人 的更多操作"]')!.click());const menu=document.querySelector('[role="menu"]')!;expect(menu.textContent).not.toContain('收款');expect(menu.textContent).not.toContain('服務完成');expect(m.status).not.toHaveBeenCalled();
});
it('follows a successful move to its new date and current booking rather than refreshing the empty old date',async()=>{
 await open();await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="本人 的更多操作"]')!.click());await act(async()=>button('改期／換技師位置').click());
 const form=document.querySelector<HTMLFormElement>('form:has(#beauty-money-title)')!;for(const [key,value] of Object.entries({date:'2026-10-27',time:'13:00',note:'合成改期'}))(form.elements.namedItem(key) as HTMLInputElement).value=value;
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.move).toHaveBeenCalledWith('manager',expect.objectContaining({id:'a',date:'2026-10-27',time:'13:00'}));expect(m.push.mock.calls[0][0]).toContain('date=2026-10-27');expect(m.push.mock.calls[0][0]).toContain('bookingId=a');expect(m.refresh).not.toHaveBeenCalled();
});
it('clears a closed deep link and can reopen the same booking from a notice',async()=>{
 m.params=new URLSearchParams('bookingId=a');window.history.replaceState(null,'','/dashboard/beauty?bookingId=a');await act(async()=>root.render(h(BeautyDashboard,{data,tab:'班表',slug:'test',initialAppointmentId:'a'})));expect(document.body.textContent).toContain('預約明細');await act(async()=>button('關閉').click());expect(window.location.search).not.toContain('bookingId');
 m.params=new URLSearchParams();await act(async()=>root.render(h(BeautyDashboard,{data,tab:'班表',slug:'test',initialAppointmentId:'a'})));m.params=new URLSearchParams('bookingId=a');await act(async()=>root.render(h(BeautyDashboard,{data,tab:'班表',slug:'test',initialAppointmentId:'a'})));expect(document.body.textContent).toContain('預約明細');
});
it('shows a rejected payment once inside the active form, preserving entered values',async()=>{
 await act(async()=>root.render(h(BeautyDashboard,{data:{...data,items:[{...data.items[0],cardId:null}]},tab:'班表',slug:'test'})));await act(async()=>button('開啟預約').click());await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="本人 的更多操作"]')!.click());await act(async()=>button('收款').click());const form=document.querySelector<HTMLFormElement>('form:has(#beauty-money-title)')!;(form.elements.namedItem('note') as HTMLInputElement).value='保留備註';await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);expect(document.querySelector('[role="alert"]')!.textContent).toBe('超過應收');expect((form.elements.namedItem('note') as HTMLInputElement).value).toBe('保留備註');
});
