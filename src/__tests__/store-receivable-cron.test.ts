import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({scope:vi.fn(),reconcile:vi.fn(),incomplete:vi.fn()}));
vi.mock('../../scripts/digital-manager-cron-preview-scope.mjs',()=>({digitalManagerCronPreviewScope:m.scope}));
vi.mock('@/server/services/store-receivable-notices',()=>({reconcileStoreReceivableNotices:m.reconcile}));
vi.mock('@/server/services/incomplete-service-reminders',()=>({runIncompleteServiceReminders:m.incomplete}));
import {GET} from '@/app/api/cron/incomplete-service-reminders/route';
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('CRON_SECRET','synthetic-cron-secret');
 m.scope.mockReturnValue(null);m.reconcile.mockResolvedValue({stores:4,failed:0});m.incomplete.mockResolvedValue({scanned:0,due:0,sent:0,skipped:0,failed:0});
});
afterEach(()=>vi.unstubAllEnvs());
const request=(token='synthetic-cron-secret')=>new NextRequest('https://example.invalid/api/cron/incomplete-service-reminders',{headers:{authorization:`Bearer ${token}`}});
it('does not scan or write financial reminders without the cron authorization',async()=>{
 expect((await GET(request('wrong'))).status).toBe(401);
 expect(m.scope).not.toHaveBeenCalled();expect(m.reconcile).not.toHaveBeenCalled();expect(m.incomplete).not.toHaveBeenCalled();
});
it('reuses the existing authorized schedule without sending through a new channel',async()=>{
 expect((await GET(request())).status).toBe(200);
 expect(m.reconcile).toHaveBeenCalledExactlyOnceWith(expect.any(Date),undefined);expect(m.incomplete).toHaveBeenCalledOnce();
});
it('uses only the isolated preview stores and business clock when an acceptance scope exists',async()=>{
 const now=new Date('2026-11-01T12:00Z');m.scope.mockReturnValue({now,storeIds:['isolated']});
 expect((await GET(request())).status).toBe(200);
 expect(m.reconcile).toHaveBeenCalledExactlyOnceWith(now,['isolated']);
});
it('fails closed for a rejected acceptance scope and reports reconciliation failures',async()=>{
 m.scope.mockImplementationOnce(()=>{throw Error('rejected scope');});
 expect((await GET(request())).status).toBe(401);expect(m.reconcile).not.toHaveBeenCalled();
 m.reconcile.mockResolvedValue({stores:4,failed:1});
 const response=await GET(request());expect(response.status).toBe(500);expect(await response.json()).toMatchObject({ok:false,failed:1});
});
