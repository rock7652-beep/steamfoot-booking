import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({portal:vi.fn()}));
vi.mock('@/server/beauty/queries',()=>({beautyPortal:m.portal}));
vi.mock('next/server',()=>({NextResponse:{json:(value:unknown,init?:ResponseInit)=>new Response(JSON.stringify(value),init)}}));
import {GET} from '@/app/api/beauty/portal-role/route';
import {readBeautyPortalRole} from '@/lib/beauty/portal-role-read';
const request=(q:string)=>({nextUrl:new URL('https://preview.invalid/api/beauty/portal-role?'+q)}) as NextRequest;
beforeEach(()=>{vi.clearAllMocks();m.portal.mockResolvedValue({work:true,store:{id:'actual',slug:'test'}});});
afterEach(()=>vi.unstubAllGlobals());
it('reads a freshly authenticated role and disables browser/CDN caching',async()=>{
 const r=await GET(request('work=1&store=test&storeId=foreign&userId=foreign'));expect(r.status).toBe(200);expect(m.portal).toHaveBeenCalledWith(true);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(r.headers.get('Vary')).toBe('Cookie');expect(await r.json()).toMatchObject({success:true,data:{store:{id:'actual'}}});
});
it('rejects missing/invalid modes, changed stores and revoked authorization without returning payloads',async()=>{
 expect((await GET(request('work=true&store=test'))).status).toBe(403);expect(m.portal).not.toHaveBeenCalled();
 const different=await GET(request('work=1&store=other'));expect(different.status).toBe(403);expect(await different.json()).not.toHaveProperty('data');
 m.portal.mockRejectedValue(new Error('revoked'));const r=await GET(request('work=1&store=test'));expect(r.status).toBe(403);expect(await r.json()).not.toHaveProperty('data');expect(r.headers.get('Cache-Control')).toBe('private, no-store');
});
it('uses a same-origin no-store request and refuses a response for another store or role',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{work:true,store:{slug:'test'}}})));vi.stubGlobal('fetch',fetcher);
 expect((await readBeautyPortalRole(true,'test')).success).toBe(true);expect(fetcher.mock.calls[0]).toEqual(['/api/beauty/portal-role?work=1&store=test',{cache:'no-store',credentials:'same-origin'}]);
 fetcher.mockResolvedValue(new Response(JSON.stringify({success:true,data:{work:false,store:{slug:'other'}}})));expect((await readBeautyPortalRole(true,'test')).success).toBe(false);
});
