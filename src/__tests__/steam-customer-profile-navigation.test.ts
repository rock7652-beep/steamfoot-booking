// @vitest-environment jsdom
import {act,createElement,useState,useCallback} from 'react';
import {SettingsPanelContext,useSettingsPanelGuard,canNavigateSettingsPanel,type SettingsPanelState,type SettingsPanelNavigationOptions} from '@/components/admin/settings-panel-context';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
vi.mock('@/components/customer-attribution-form',()=>({CustomerAttributionForm:()=>createElement('div',{'data-editor':'attribution'})}));
vi.mock('@/components/admin/store-member-connection-panel',()=>({StoreMemberConnectionPanel:()=>createElement('p',null,'會員登入狀態')}));
vi.mock('@/components/admin/steam-plan-management',()=>({SteamPlanManagement:({action,guardId,onPending}:{action:string;guardId?:string;onPending?:(value:boolean)=>void})=>{
 const [dirty,setDirty]=useState(false),[pending,setPending]=useState(false);useSettingsPanelGuard(dirty,pending,guardId);
 return createElement('div',{'data-plan-action':action},action,createElement('input',{'aria-label':'測試方案草稿',onChange:()=>setDirty(true)}),createElement('button',{onClick:()=>{setPending(true);onPending?.(true);}},'模擬交易待確認'));
}}));
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
const click=async(label:string)=>{await act(async()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent===label||button.getAttribute('aria-label')===label);expect(button,label).toBeTruthy();button!.click();});};
const visibleText=()=>[...host.querySelectorAll('section')].filter(e=>!e.hidden&&!e.closest('[hidden]')).map(e=>e.textContent).join(' ');
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{fn();return 0;});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('offers stable sections and puts all records behind one entry without losing cardless events',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,props)));
 expect([...host.querySelectorAll('nav button')].map(button=>button.textContent)).toEqual(['總覽','健康追蹤']);
 expect(visibleText()).not.toContain('預約保留');expect(visibleText()).toContain('購買 2026-11-01');
 await click('全部紀錄');expect(host.querySelector('[data-records="bookings"]')?.textContent).toBe('無方案單次預約');
 await act(async()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="紀錄類型"]')!;select.value='purchases';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('[data-records="consumption"]')?.textContent).toBe('無卡消費');
 await click('‹ 返回總覽');expect(visibleText()).toContain('test@example.invalid');expect(visibleText()).not.toContain('健康量測');
 await click('健康追蹤');expect(visibleText()).not.toContain('test@example.invalid');expect(host.querySelector('[data-summary="health"]')).not.toBeNull();
});
it('uses a single expanded LINE destination and the same plan history from its name',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,props)));
 await click('LINE 通知：未連結 · 管理');expect(host.querySelector('[data-line-expanded="true"]')).not.toBeNull();
 await click('‹ 返回總覽');await click('十堂方案');expect(host.querySelector('[data-plan-action]')?.getAttribute('data-plan-action')).toBe('history');
});
it('does not expose a health tab without the feature',async()=>{
 await act(async()=>root.render(createElement(CustomerDetailDrawerContent,{...props,initialSummary:{...props.initialSummary!,healthEnabled:false}})));
 expect([...host.querySelectorAll('nav button')].map(button=>button.textContent)).toEqual([]);
});


it('switches a dirty plan inside the live guard context while guarding external navigation and pending work',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 function Harness(){
  const [states]=useState(()=>new Map<string,SettingsPanelState>());
  const report=useCallback((id:string,state:SettingsPanelState|null)=>{if(state)states.set(id,state);else states.delete(id);},[states]);
  const allow=useCallback((options?:SettingsPanelNavigationOptions)=>canNavigateSettingsPanel(states,()=>window.confirm('捨棄？'),options),[states]);
  return createElement(SettingsPanelContext.Provider,{value:{report,navigate:()=>{}}},createElement(CustomerDetailDrawerContent,{...props,allowNavigation:allow}));
 }
 await act(async()=>root.render(createElement(Harness)));
 const grid=host.querySelector('[data-grid]');await click('十堂方案 更多操作');await click('補登已上課');
 const fill=async()=>{const input=host.querySelector<HTMLInputElement>('[aria-label="測試方案草稿"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'未送出');input.dispatchEvent(new Event('input',{bubbles:true}));});};
 await fill();await click('十堂方案 更多操作');await click('註銷堂數');expect(host.querySelector('[data-plan-action]')?.getAttribute('data-plan-action')).toBe('VOID');expect(confirm).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('[aria-label="測試方案草稿"]')?.value).toBe('');expect(host.querySelector('[data-grid]')).toBe(grid);
 await fill();await click('健康追蹤');expect(confirm).toHaveBeenCalledOnce();expect(host.querySelector('[data-plan-action]')?.getAttribute('data-plan-action')).toBe('VOID');
 await click('模擬交易待確認');await click('十堂方案 更多操作');const expiry=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='調整期限')!;expect(expiry.disabled).toBe(true);
});
