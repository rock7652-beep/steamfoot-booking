import {createElement as h,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/dashboard-link',()=>({DashboardLink:({children,...props}:{children:ReactNode})=>h('a',props,children)}));
vi.mock('@/components/feature-presentation',()=>({FeatureEntry:({children}:{children:ReactNode})=>children}));
vi.mock('@/app/(dashboard)/dashboard/cashbook/_components/cashbook-shortcut',()=>({CashbookShortcut:()=>null}));
import {RevenueTabs} from '@/app/(dashboard)/dashboard/revenue/_components/revenue-tabs';
it('keeps the default operations navigation unchanged unless a module supplies the extension',()=>{const html=renderToStaticMarkup(h(RevenueTabs,{readOnly:true}));expect(html).toContain('營收明細');expect(html).not.toContain('收入分類');expect(html).not.toContain('/dashboard/beauty');});
it('lets the module link back to its own ledger and append its income classification',()=>{const html=renderToStaticMarkup(h(RevenueTabs,{readOnly:true,ledgerHref:'/dashboard/beauty?tab=營運',extra:h('span',null,'收入分類')}));expect(html).toContain('href="/dashboard/beauty?tab=營運"');expect(html).toContain('收入分類');});
