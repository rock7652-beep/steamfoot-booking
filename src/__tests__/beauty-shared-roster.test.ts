// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({status:vi.fn()}));
vi.mock('@/server/actions/beauty-display-order',()=>({saveBeautyDisplayOrder:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/dashboard/beauty'}));
vi.mock('@/lib/beauty/calendar-read',()=>({readBeautyCalendar:vi.fn(),projectBeautyCalendar:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/customer-list',()=>({CourseCustomerList:()=>null}));
vi.mock('@/server/actions/beauty',()=>({changeBeautyStatus:m.status,linkBeautyCustomer:vi.fn(),confirmBeautyPurchase:vi.fn(),collectBeautyPayment:vi.fn(),purchaseBeautyPlan:vi.fn(),refundBeautyPayment:vi.fn(),confirmBeautySettlement:vi.fn(),saveBeautyCustomer:vi.fn(),moveBeautyAppointment:vi.fn()}));
vi.mock('@/components/beauty/schedule-workspace',()=>({BeautyScheduleWorkspace:({onOpen}:{onOpen:(id:string)=>void})=>h('button',{onClick:()=>onOpen('a')},'開啟預約')}));
vi.mock('@/components/beauty/customer-panel',()=>({BeautyCustomerPanel:()=>null}));
vi.mock('@/components/beauty/catalog-editor',()=>({BeautyCatalogEditor:()=>null}));
vi.mock('@/components/beauty/booking-form',()=>({BeautyBookingForm:()=>null}));
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
import {BeautyDashboard} from '@/components/beauty/dashboard';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const item={id:'a',groupId:'group',personName:'本人',personPhone:'0900000001',customerId:'customer',serviceId:'service',serviceName:'做臉',startsAt:'2026-10-22T01:00:00.000Z',endsAt:'2026-10-22T02:00:00.000Z',occupiedEndsAt:'2026-10-22T02:00:00.000Z',technicianId:'tech',locationId:'room',cardId:'card',price:1000,status:'RESERVED',revision:7,notes:'本次注意事項'};
const data={date:'2026-10-22',month:'2026-10',calendar:'day',now:Date.parse('2026-10-22T00:00:00Z'),store:{id:'store',slug:'test'},items:[item,{...item,id:'b',personName:'同行者',serviceName:'按摩',endsAt:'2026-10-22T02:30:00.000Z'},{...item,id:'other',groupId:'other-group',personName:'另一組'}],cards:[{id:'card',remaining:5,held:3}],customers:[],services:[],plans:[],techs:[{id:'tech',name:'技師',active:true}],locations:[{id:'room',name:'位置',isActive:true}],payments:[],purchases:[],policy:{},access:{planAccess:true,customerAccess:true,financeAccess:true},manage:{update:true,collect:true,customer:false,card:true},calendarDays:{}} as unknown as BeautyDashboardData;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.status.mockReset().mockResolvedValue({success:true});});
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
