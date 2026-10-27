import {createElement as h,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/dashboard-link',()=>({DashboardLink:({children,...props}:{children:ReactNode})=>h('a',props,children)}));
import {RevenueTabs} from '@/app/(dashboard)/dashboard/revenue/_components/revenue-tabs';
it('uses the same ordered operations areas for every industry',()=>{
 const html=renderToStaticMarkup(h(RevenueTabs,{}));
 const labels=['營收明細','收入分類','現金帳','月結管理','報表匯出'];
 expect(labels.map(label=>html.indexOf(label))).toEqual([...labels.map(label=>html.indexOf(label))].sort((a,b)=>a-b));
 for(const label of labels)expect(html).toContain(label);
 expect(html).not.toContain('更多工具');expect(html).not.toContain('完整現金管理');
});
it('preserves the beauty ledger while all financial tools stay inside operations',()=>{
 const html=renderToStaticMarkup(h(RevenueTabs,{beautyLedger:true,active:'monthly',query:{month:'2026-09',dateFrom:'2026-09-01',dateTo:'2026-09-30'}}));
 expect(html).toContain('tab=%E7%87%9F%E9%81%8B');expect(html).toContain('area=monthly');expect(html).toContain('aria-current="page"');
 expect(html).not.toContain('/dashboard/service-fee-calculator');
});
it('does not render an unauthorized tab',()=>{
 const html=renderToStaticMarkup(h(RevenueTabs,{active:'exports',available:['exports']}));
 expect(html).toContain('報表匯出');expect(html).not.toContain('營收明細');expect(html).not.toContain('月結管理');
});
