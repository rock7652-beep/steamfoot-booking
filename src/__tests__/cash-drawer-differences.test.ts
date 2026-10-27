import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({sessions:vi.fn(),check:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{cashDrawerSession:{findMany:m.sessions}}}));
vi.mock('@/server/reconciliation/finance-checks',()=>({checkClosedCashDrawers:m.check}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:'a'}));
import {CashDrawerReconciliation} from '@/app/(dashboard)/dashboard/cash-drawer/cash-drawer-reconciliation';
beforeEach(()=>vi.resetAllMocks());
it('separates point-count shortages from changes made after close, within the selected store',async()=>{
 m.sessions.mockResolvedValue([{id:'close',businessDate:new Date('2026-10-26'),expectedClosingCash:5000,closingActualCash:4500,closingDifference:-500,closingNote:'清點短少'}]);
 m.check.mockResolvedValue({debugPayload:{issues:[{sessionId:'close',businessDate:'2026-10-26',saved:5000,current:5200,difference:200}]}});
 const html=renderToStaticMarkup(await CashDrawerReconciliation({storeId:'selected-store',today:'2026-10-27'}));
 expect(html).toContain('清點短少');expect(html).toContain('NT$ -500');expect(html).toContain('結帳後收支異動');expect(html).toContain('NT$ 200');
 expect(m.sessions).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'selected-store',status:'CLOSED'})}));
 expect(m.check).toHaveBeenCalledWith('selected-store',new Date('2026-10-01'),new Date('2026-10-27'));
});
it('does not report a failed read as balanced',async()=>{
 m.check.mockRejectedValue(new Error('unavailable'));m.sessions.mockResolvedValue([]);
 const html=renderToStaticMarkup(await CashDrawerReconciliation({storeId:'store',today:'2026-10-27'}));
 expect(html).toContain('role="alert"');expect(html).toContain('不能判定帳目一致');expect(html).not.toContain('沒有點錢差額');
});
