// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams({month:'2026-11'}),usePathname:()=>'/hq/dashboard/revenue'}));
vi.mock('@/server/actions/course-monthly-settlement',()=>({confirmCourseMonthlySettlement:vi.fn(),saveCourseSettlementSettings:vi.fn(),payCourseProfit:vi.fn(),correctCourseProfit:vi.fn()}));
vi.mock('@/server/actions/course-fee-payment',()=>({payCourseFee:vi.fn(),correctCourseFee:vi.fn()}));
vi.mock('@/server/actions/staff-monthly-adjustment',()=>({saveMonthlyAdjustment:vi.fn(),deleteMonthlyAdjustment:vi.fn(),changeAdjustmentMonthLock:vi.fn()}));
import {CourseMonthlyReport} from '@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client';
import {SteamfootMonthlyReport} from '@/app/(dashboard)/dashboard/service-fee-calculator/steamfoot-monthly-report';
import {MonthlyAdjustmentProvider} from '@/components/operations/monthly-adjustment-context';
import {MonthlyAdjustments} from '@/app/(dashboard)/dashboard/service-fee-calculator/monthly-adjustments';
import {steamfootMonthlyLines} from '@/lib/steamfoot-monthly-view';
import type {SettlementDetailRow} from '@/server/queries/staff-settlement';
import type {SettlementLine} from '@/lib/course-monthly-settlement';
let host:HTMLDivElement,root:Root;
const people=[{id:'a',name:'人員甲',active:true},{id:'b',name:'人員乙',active:true}];
const snapshot={storeId:'test',month:'2026-11',locked:false,revision:1,rows:[{id:'a3407c3e-4ed7-4b85-8a09-5aa4cb5ecdfa',staffId:'a',month:'2026-11',date:'2026-11-04',direction:'ADD' as const,amount:100,reason:'服務獎勵',revision:1}]};
const lines:SettlementLine[]=[{kind:'PROFIT',id:'profit',staffId:'a',name:'人員甲',label:'店長方案利潤',date:'2026-11-03T01:00:00Z',amount:200,paid:0,issue:null,payments:[]},{kind:'FEE',id:'fee',staffId:'a',name:'人員甲',label:'教學項目',date:'2026-11-02T01:00:00Z',amount:500,paid:0,issue:null,payments:[]}];
const button=(text:string)=>[...document.querySelectorAll('button')].find(n=>n.textContent===text)!;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it.each([false,true])('connects the %s course module to flat detail, distinct profit/fee columns and top adjustment tools',async music=>{
 const tools=h(MonthlyAdjustments,{integrated:true,confirmInReport:true,storeId:'test',month:'2026-11',locked:false,revision:1,rows:snapshot.rows,people,canEdit:true});
 await act(async()=>root.render(h(MonthlyAdjustmentProvider,{initial:snapshot,people},h(CourseMonthlyReport,{compactDetails:true,music,feeLabel:music?'教師鐘點費':'教練授課費',lines,adjustmentTools:tools,canEditAdjustments:true,canReadBookings:true,canPay:true,showPaymentStatus:true}))));
 const summary=host.querySelector('[aria-label="人員月結彙總"]')!;const row=summary.querySelector('tbody tr')!;expect([...row.querySelectorAll('td')].map(n=>n.textContent)).toEqual(['人員甲','NT$ 200','NT$ 500','+NT$ 100','−NT$ 0','NT$ 800']);expect(summary.textContent).toContain(music?'教師鐘點費':'教練授課費');expect(button('＋新增獎勵與調整')).toBeDefined();expect(host.querySelector('.group\\/person')).toBeNull();expect(host.textContent).not.toMatch(/已付|未付/);
 const detail=host.querySelector('[aria-label="月結逐筆明細"]')!;expect([...detail.querySelectorAll('tbody tr')].map(n=>n.getAttribute('data-monthly-line'))).toEqual(['FEE:fee','PROFIT:profit',`ADJUSTMENT:${snapshot.rows[0].id}`]);
 await act(async()=>button(music?'教師授課費':'教練授課費').click());expect(summary.querySelector('tbody tr')?.textContent).toContain('NT$ 600');expect(detail.textContent).not.toContain('店長方案利潤');
 await act(async()=>button('店長利潤').click());expect(summary.querySelector('tbody tr')?.textContent).toContain('NT$ 200');expect(detail.textContent).not.toContain('服務獎勵');await act(async()=>button('全部').click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[data-monthly-line="FEE:fee"] td:nth-child(3) button')!.click());const link=[...document.querySelectorAll('a')].find(n=>n.textContent==='查看課堂')!;expect(link.getAttribute('href')).toContain('returnMonthlyMonth=2026-11');expect(link.getAttribute('href')).toContain('session=fee');expect(button('登錄已付')).toBeDefined();
});
const detail=(patch:Partial<SettlementDetailRow>={}):SettlementDetailRow=>({bookingId:'service',bookingDate:new Date('2026-11-01T00:00:00Z'),slotTime:'09:00',customerName:'合成顧客',bookingType:'PACKAGE_SESSION',isMakeup:false,revenueStaffId:'a',revenueStaffName:'人員甲',serviceStaffId:'b',serviceStaffName:'人員乙',walletId:'wallet',amount:100,amountSource:'formula_clean',needsReview:false,counted:true,...patch});
it('uses Steamfoot counted service income, retains zero-income people and never subtracts rent',async()=>{
 const original=steamfootMonthlyLines([{id:'a',name:'人員甲',details:[detail(),detail({bookingId:'not-counted',amount:9999,counted:false})]}]);expect(original.map(l=>l.amount)).toEqual([100,0]);expect(original[1].feeDetails?.[0].reason).toContain('未計入');
 await act(async()=>root.render(h(MonthlyAdjustmentProvider,{initial:snapshot,people},h(SteamfootMonthlyReport,{lines:original,people,canEdit:true,tools:h(MonthlyAdjustments,{integrated:true,storeId:'test',month:'2026-11',locked:false,revision:1,rows:snapshot.rows,people,canEdit:true})}))));
 expect(host.querySelector('[data-monthly-person="a"]')?.textContent).toContain('NT$ 200');expect(host.querySelector('[data-monthly-person="b"]')?.textContent).toContain('NT$ 0');expect(host.querySelectorAll('[data-monthly-line]')).toHaveLength(3);expect(host.textContent).toContain('租金依原約定分列，不自動從收入扣除');expect(button('＋新增獎勵與調整')).toBeDefined();expect(button('完成月結')).toBeDefined();expect(host.textContent).not.toMatch(/已付|未付/);
});
it('keeps unresolved Steamfoot records unknown instead of treating their raw value as counted income',()=>{const projected=steamfootMonthlyLines([{id:'a',name:'人員甲',details:[detail({amount:9999,needsReview:true,counted:false})]}]);expect(projected[0]).toMatchObject({amount:null,issue:'服務收入待核對',date:'2026-11-01T09:00:00+08:00'});});

it('does not present a profit column or broader category controls to fee-scoped readers',async()=>{await act(async()=>root.render(h(CourseMonthlyReport,{compactDetails:true,scopeFeeOnly:true,lines:lines.filter(l=>l.kind==='FEE'),feeLabel:'授課費'})));expect(host.textContent).not.toContain('店長利潤');expect(host.querySelector('[aria-label="收入類別"]')).toBeNull();expect(host.querySelector('[data-monthly-person]')?.textContent).toContain('NT$ 500');});
