import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permissions:new Set<string>(),view:false,feature:true}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>({role:'STAFF',staffId:'staff'})}));
vi.mock('@/lib/permissions',()=>({checkPermission:async(_r:unknown,_s:unknown,p:string)=>m.permissions.has(p)}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:async()=>'store'}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:async()=>({isViewMode:m.view}),storeIdForViewContext:()=> 'store'}));
vi.mock('@/lib/store-read-only',()=>({isReadOnlyStoreTarget:()=>false}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:async()=> 'course'}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:async()=>m.feature}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:'a'}));
vi.mock('@/app/(dashboard)/dashboard/revenue/_components/operations-tabs',()=>({OperationsTabs:()=>h('nav',null,'tabs')}));
vi.mock('@/app/(dashboard)/dashboard/cashbook/workspace',()=>({default:()=>h('p',null,'cashbook-workspace')}));
vi.mock('@/app/(dashboard)/dashboard/service-fee-calculator/workspace',()=>({default:()=>h('p',null,'monthly-workspace')}));
vi.mock('@/app/(dashboard)/dashboard/store-revenue/workspace',()=>({default:()=>h('p',null,'report-workspace')}));
vi.mock('@/app/(dashboard)/dashboard/data-export/workspace',()=>({default:()=>h('p',null,'export-workspace')}));
vi.mock('@/app/(dashboard)/dashboard/reconciliation/workspace',()=>({default:()=>h('p',null,'check-workspace')}));
vi.mock('@/app/(dashboard)/dashboard/revenue/_components/operations-income',()=>({OperationsIncome:()=>h('p',null,'income-workspace')}));
vi.mock('@/components/beauty/operations-monthly',()=>({BeautyMonthly:()=>h('p',null,'beauty-monthly')}));
import {OperationsAreaContent} from '@/app/(dashboard)/dashboard/revenue/_components/operations-area';
beforeEach(()=>{m.permissions.clear();m.view=false;m.feature=true;});
it('allows export-only staff without granting ledger or monthly access',async()=>{
 m.permissions.add('customer.export');
 const html=renderToStaticMarkup(await OperationsAreaContent({area:'exports',query:{}}));
 expect(html).toContain('export-workspace');expect(html).not.toContain('report-workspace');
 const denied=renderToStaticMarkup(await OperationsAreaContent({area:'monthly',query:{}}));
 expect(denied).toContain('沒有此項');expect(denied).not.toContain('monthly-workspace');
});
it('allows report-only monthly access while preserving the feature gate',async()=>{
 m.permissions.add('report.read');
 expect(renderToStaticMarkup(await OperationsAreaContent({area:'monthly',query:{}}))).toContain('monthly-workspace');
 m.feature=false;
 const denied=renderToStaticMarkup(await OperationsAreaContent({area:'monthly',query:{}}));
 expect(denied).toContain('尚未開通');expect(denied).not.toContain('monthly-workspace');
});
it('blocks data export in a child-store read-only view',async()=>{
 m.permissions.add('report.export');m.view=true;
 const html=renderToStaticMarkup(await OperationsAreaContent({area:'exports',query:{reportView:'data'}}));
 expect(html).toContain('唯讀');expect(html).not.toContain('export-workspace');
});
it('loads advanced checks only on request and never in view mode',async()=>{
 m.permissions.add('cashbook.read');m.permissions.add('report.read');
 expect(renderToStaticMarkup(await OperationsAreaContent({area:'cashbook',query:{}}))).not.toContain('check-workspace');
 expect(renderToStaticMarkup(await OperationsAreaContent({area:'cashbook',query:{checks:'1'}}))).toContain('check-workspace');
 m.view=true;
 expect(renderToStaticMarkup(await OperationsAreaContent({area:'cashbook',query:{checks:'1'}}))).not.toContain('check-workspace');
});
