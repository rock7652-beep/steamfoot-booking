import {createElement as h,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({course:vi.fn(),beauty:vi.fn(),steam:vi.fn(),finance:vi.fn()}));
vi.mock('@/server/queries/course-revenue-report',()=>({getCourseRevenueReport:m.course}));
vi.mock('@/server/queries/steamfoot-income',()=>({readSteamfootIncome:m.steam}));
vi.mock('@/server/inventory-finance-access',()=>({requireInventoryFinanceAccess:m.finance}));
vi.mock('@/server/beauty/revenue-breakdown',()=>({readBeautyRevenueBreakdown:m.beauty}));
vi.mock('@/components/beauty/revenue-breakdown-view',()=>({BeautyRevenueBreakdownView:()=>h('p',null,'beauty classification')}));
vi.mock('@/components/instant-filter-form',()=>({InstantFilterForm:({children}:{children:ReactNode})=>h('form',null,children)}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:'a'}));
import {OperationsIncome} from '@/app/(dashboard)/dashboard/revenue/_components/operations-income';
beforeEach(()=>vi.resetAllMocks());
it('keeps trial refunds out of gross receipts and shows the correct report net',async()=>{
 m.course.mockResolvedValue({data:[{unit:'TRIAL',refund:false,netAmount:500},{unit:'TRIAL',refund:true,netAmount:-200},{unit:'SESSION',refund:false,netAmount:3000}],kpi:{refundAmount:200,netRevenue:3300}});
 const html=renderToStaticMarkup(await OperationsIncome({storeId:'store',industry:'course',query:{dateFrom:'2026-10-01',dateTo:'2026-10-27',dataScope:'legacy'}}));
 expect(html).toContain('NT$ 500');expect(html).toContain('NT$ 3,000');expect(html).toContain('NT$ 3,300');expect(html).toContain('NT$ 200');
 expect(html).not.toContain('NT$ 300<');
 expect(m.course).toHaveBeenCalledWith('store',expect.objectContaining({storeFilter:{storeId:'store'},dataScope:'legacy'}));
});
it('does not read or repeat technician obligations in beauty income classification',async()=>{
 await OperationsIncome({storeId:'beauty',industry:'beauty',query:{dateFrom:'2026-10-01',dateTo:'2026-10-27'}});
 expect(m.beauty).toHaveBeenCalledWith('beauty',{from:'2026-10-01',to:'2026-10-27',includeTechnicians:false});expect(m.course).not.toHaveBeenCalled();
});
it('rejects reversed or nonexistent dates before accessing any report',async()=>{
 const html=renderToStaticMarkup(await OperationsIncome({storeId:'store',industry:'course',query:{dateFrom:'2026-02-30',dateTo:'2026-02-28'}}));
 expect(html).toContain('role="alert"');expect(m.course).not.toHaveBeenCalled();expect(m.steam).not.toHaveBeenCalled();
});

it('shows retail, other income and actual refunds with the same net as the Steamfoot ledger',async()=>{
 m.steam.mockResolvedValue({trial:15000,single:7000,plan:90000,other:0,retail:40000,otherIncome:500,manual:40500,gross:152500,refund:8000,net:144500});
 const html=renderToStaticMarkup(await OperationsIncome({storeId:'store',industry:'steamfoot',query:{dateFrom:'2026-10-01',dateTo:'2026-10-29'}}));
 for(const text of ['零售收入','其他收入','NT$ 40,000','NT$ 500','NT$ 8,000','NT$ 152,500','NT$ 144,500'])expect(html).toContain(text);
 expect(m.steam).toHaveBeenCalledWith('store','2026-10-01','2026-10-29');expect(m.course).not.toHaveBeenCalled();
});
