// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
vi.mock('@/components/customer-attribution-form',()=>({CustomerAttributionForm:()=>createElement('div',{'data-editor':'attribution'})}));
vi.mock('@/components/admin/store-member-connection-panel',()=>({StoreMemberConnectionPanel:()=>createElement('p',null,'會員登入狀態')}));
vi.mock('@/components/admin/steam-plan-management',()=>({SteamPlanManagement:({action}:{action:string})=>createElement('div',{'data-plan-action':action},action)}));
vi.mock('@/app/(dashboard)/dashboard/bookings/booking-service-note-editor',()=>({BookingServiceNoteEditor:()=>createElement('div',{'data-note':true},'顧客備註')}));
vi.mock('@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form',()=>({AssignPlanForm:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/customers/[id]/create-booking-form',()=>({CreateBookingForm:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/customers/[id]/edit/edit-customer-form',()=>({EditCustomerForm:()=>createElement('form',{'data-editor':'profile'})}));
vi.mock('@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced',()=>({CustomerPanelAdvanced:({lineExpanded}:{lineExpanded:boolean})=>createElement('div',{'data-line-expanded':String(lineExpanded)},'LINE 管理操作')}));
vi.mock('@/app/(dashboard)/dashboard/customers/_components/customer-panel-sessions',()=>({CustomerPanelSessions:()=>createElement('div',{'data-grid':true},'11/13')}));
vi.mock('@/app/(dashboard)/dashboard/customers/_components/customer-panel-summary',()=>({CustomerPanelSummaryView:({section}:{section:string})=>createElement('p',{'data-summary':section},section==='health'?'健康量測':'下次預約')}));
vi.mock('@/app/(dashboard)/dashboard/customers/_components/customer-panel-records',()=>({CustomerPanelRecordsList:({kind,active}:{kind:string;active:boolean})=>active?createElement('p',{'data-records':kind},kind==='bookings'?'無方案單次預約':'無卡消費'):null}));
import {CustomerDetailDrawerContent} from '@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content';
const props={customer:{id:'customer',name:'測試顧客',phone:'0900000000',email:'test@example.invalid',updatedAt:new Date(),lineLinkStatus:'UNLINKED',lineUserId:null,sponsor:null,assignedStaffId:null,canReadBookings:true,canReadWallets:true,canAdjustWallet:true,canAssignPlan:true,recentConsumption:[],bookingDays:[],_count:{planWallets:1,bookings:0},planWallets:[{id:'wallet',storeId:'store',purchasedAt:new Date('2026-11-01T00:00:00Z'),status:'ACTIVE',totalSessions:10,remainingSessions:8,expiryDate:new Date('2099-12-31T00:00:00Z'),purchasedPrice:5491,plan:{id:'plan',name:'十堂方案'},sessions:[],bookings:[]}]},initialSummary:{healthEnabled:true},plans:[],staffOptions:[],canAssign:true,canDiscount:false,canEditNote:true,onMutated:vi.fn(),onClose:vi.fn(),titleId:'title'} as unknown as Parameters<typeof CustomerDetailDrawerContent>[0];
let host:HTMLDivElement,root:Root;
const click=async(label:string)=>{await act(async()=>{const button=[...host.querySelectorAll('button')].find(button=>button.textContent===label||button.getAttribute('aria-label')===label);expect(button,label).toBeTruthy();button!.click();});};
const visibleText=()=>[...host.querySelectorAll('section')].filter(e=>!e.hidden&&!e.closest('[hidden]')).map(e=>e.textContent).join(' ');
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{fn();return 0;});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('offers stable sections and puts all records behind one entry without losing cardless events',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,props)));
 expect([...host.querySelectorAll('nav button')].map(button=>button.textContent)).toEqual(['總覽','資料','健康追蹤']);
 expect(visibleText()).not.toContain('預約保留');expect(visibleText()).toContain('購買 2026-11-01');
 await click('全部紀錄');expect(host.querySelector('[data-records="bookings"]')?.textContent).toBe('無方案單次預約');
 await act(async()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="紀錄類型"]')!;select.value='purchases';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('[data-records="consumption"]')?.textContent).toBe('無卡消費');
 await click('資料');expect(visibleText()).toContain('test@example.invalid');expect(visibleText()).not.toContain('健康量測');
 await click('健康追蹤');expect(visibleText()).not.toContain('test@example.invalid');expect(host.querySelector('[data-summary="health"]')).not.toBeNull();
});
it('uses a single expanded LINE destination and the same plan history from its name',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,props)));
 await click('LINE 通知：未連結 · 管理');expect(host.querySelector('[data-line-expanded="true"]')).not.toBeNull();
 await click('‹ 返回總覽');await click('十堂方案');expect(host.querySelector('[data-plan-action]')?.getAttribute('data-plan-action')).toBe('history');
});
it('does not expose a health tab without the feature',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,{...props,initialSummary:{...props.initialSummary!,healthEnabled:false}})));
 expect([...host.querySelectorAll('nav button')].map(button=>button.textContent)).toEqual(['總覽','資料']);
});
