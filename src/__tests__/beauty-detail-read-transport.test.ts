import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({context:vi.fn(),history:vi.fn(),income:vi.fn(),records:vi.fn()}));
vi.mock('@/lib/store-context',()=>({getStoreContext:m.context}));
vi.mock('@/server/actions/beauty-portal',()=>({readBeautyCardHistory:m.history,readBeautyOwnIncome:m.income,readBeautyWorkRecords:m.records}));
vi.mock('next/server',()=>({NextResponse:{json:(value:unknown,init?:ResponseInit)=>new Response(JSON.stringify(value),init)}}));
import {GET} from '@/app/api/beauty/portal-details/route';
import {readBeautyWorkRecords} from '@/lib/beauty/portal-detail-read';
const req=(q:string)=>({nextUrl:new URL('https://preview.invalid/api/beauty/portal-details?'+q)})as NextRequest;
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue({storeSlug:'test',storeId:'store'});m.records.mockResolvedValue({success:true,data:{items:[],hasMore:false}});m.history.mockResolvedValue({success:true,data:[]});m.income.mockResolvedValue({success:true,data:{confirmed:false,lines:[]}});});
afterEach(()=>vi.unstubAllGlobals());
it('serves records as JSON without an RSC update and keeps current auth readers and no-store headers',async()=>{
 const r=await GET(req('kind=records&store=test&month=2026-10&pending=1&search=王&page=2'));expect(r.status).toBe(200);expect(m.records).toHaveBeenCalledWith({month:'2026-10',pending:true,search:'王',page:2});expect(await r.json()).toEqual({success:true,data:{items:[],hasMore:false}});expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(r.headers.get('Vary')).toBe('Cookie');
});
it('refuses changed stores and invalid parameters before any reader, and exposes no data for revoked access',async()=>{
 expect((await GET(req('kind=records&store=foreign&month=2026-10&pending=1'))).status).toBe(403);expect(m.records).not.toHaveBeenCalled();expect((await GET(req('kind=records&store=test&month=2026-10&pending=bad'))).status).toBe(403);expect(m.records).not.toHaveBeenCalled();m.records.mockResolvedValue({success:false,error:'工作權限已停用'});const r=await GET(req('kind=records&store=test&month=2026-10&pending=1'));expect(r.status).toBe(403);expect(await r.json()).toEqual({success:false,error:'工作權限已停用'});
});
it('keeps card ownership and income permission checks in their existing guarded readers',async()=>{
 await GET(req('kind=history&store=test&card=shared'));expect(m.history).toHaveBeenCalledWith('shared');await GET(req('kind=income&store=test&month=2026-09'));expect(m.income).toHaveBeenCalledWith('2026-09');
});
it('reads through same-origin GET, never the page Server Action transport, and rejects malformed payloads',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{items:[],hasMore:false}})));vi.stubGlobal('fetch',fetcher);await readBeautyWorkRecords({month:'2026-10',pending:true,search:'',page:0},'test');expect(fetcher.mock.calls[0][0]).toBe('/api/beauty/portal-details?store=test&kind=records&month=2026-10&pending=1&search=&page=0');expect(fetcher.mock.calls[0][1]).toMatchObject({cache:'no-store',credentials:'same-origin'});expect(fetcher.mock.calls[0][1]).not.toHaveProperty('method','POST');fetcher.mockResolvedValue(new Response(JSON.stringify({success:true})));await expect(readBeautyWorkRecords({month:'2026-10',pending:true,search:'',page:0},'test')).rejects.toThrow('讀取失敗');
});
