import {expect,it,vi} from 'vitest';
const redirect=vi.hoisted(()=>vi.fn((url:string):never=>{throw new Error(url);}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({'x-next-pathname':'/s/selected-child/admin/dashboard/data-export'})}));
vi.mock('next/navigation',()=>({redirect}));
import DataExportPage from '@/app/(dashboard)/dashboard/data-export/page';
import StoreRevenuePage from '@/app/(dashboard)/dashboard/store-revenue/page';
it('routes old data export links into the shared export tab without losing context',async()=>{
 await expect(DataExportPage({searchParams:Promise.resolve({dateFrom:'2026-09-01',dateTo:'2026-09-30'})})).rejects.toThrow('area=exports');
 expect(redirect).toHaveBeenLastCalledWith(expect.stringContaining('reportView=data'));
 expect(redirect.mock.lastCall?.[0]).toContain('dateFrom=2026-09-01');
});
it('routes old revenue reports into the overview inside operations',async()=>{
 await expect(StoreRevenuePage({searchParams:Promise.resolve({dataScope:'legacy'})})).rejects.toThrow('area=exports');
 expect(redirect.mock.lastCall?.[0]).toContain('reportView=overview');expect(redirect.mock.lastCall?.[0]).toContain('dataScope=legacy');
});

it('retains the current child-store namespace during legacy redirects',async()=>{
 await expect(DataExportPage({searchParams:Promise.resolve({})})).rejects.toThrow('/s/selected-child/admin/dashboard/revenue?');
});
