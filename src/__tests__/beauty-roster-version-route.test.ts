import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({context:vi.fn(),where:vi.fn(),version:vi.fn(),load:vi.fn()}));
vi.mock('@/server/beauty/roster-read',()=>({beautyRosterContext:m.context,beautyRosterWhere:m.where,beautyRosterVersion:m.version,loadBeautyRoster:m.load}));
import {GET} from '@/app/api/beauty/roster/route';
const version='a'.repeat(64),request=(params='')=>new NextRequest('https://example.test/api/beauty/roster?scope=day:2026-12-04&store=test'+params);
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue({a:{storeId:'test'}});m.where.mockResolvedValue({groupId:'group'});m.version.mockResolvedValue(version);m.load.mockImplementation(async(_c,_w,v)=>({success:true,data:{roster:[],readVersion:v}}));});
it('revalidates authorization and returns only the unchanged token without reading roster records',async()=>{const response=await GET(request('&version='+version));expect(await response.json()).toEqual({success:true,unchanged:true,version});expect(m.context).toHaveBeenCalledOnce();expect(m.load).not.toHaveBeenCalled();expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('server-timing')).toContain('handler;dur=');});
it('reads a changed payload after capturing its version',async()=>{const response=await GET(request('&version='+'b'.repeat(64)));expect(await response.json()).toMatchObject({success:true,unchanged:false,version,data:{readVersion:version}});expect(m.version.mock.invocationCallOrder[0]).toBeLessThan(m.load.mock.invocationCallOrder[0]);});
it('rejects a stale or forged store receipt before looking up the scope or token',async()=>{m.context.mockResolvedValue({a:{storeId:'other'}});const response=await GET(request('&version='+version));expect(response.status).toBe(403);expect(m.where).not.toHaveBeenCalled();expect(m.load).not.toHaveBeenCalled();});
it('does not let a matching token bypass a revoked permission',async()=>{m.context.mockRejectedValue(new Error('permission revoked'));const response=await GET(request('&version='+version));expect((await response.json()).success).toBe(false);expect(m.version).not.toHaveBeenCalled();});

it('shares identity lookups only within a single GET and checks the next request again',async()=>{
 const {memoizeReadRequest}=await import('@/server/services/read-request-memo');
 const identity=vi.fn(async()=>({a:{storeId:'test'}}));
 m.context.mockImplementation(async()=>{const [a,b]=await Promise.all([memoizeReadRequest('session.current-user',identity),memoizeReadRequest('session.current-user',identity)]);expect(a).toBe(b);return a;});
 expect((await GET(request())).status).toBe(200);
 expect(identity).toHaveBeenCalledOnce();
 expect((await GET(request())).status).toBe(200);
 expect(identity).toHaveBeenCalledTimes(2);
});
