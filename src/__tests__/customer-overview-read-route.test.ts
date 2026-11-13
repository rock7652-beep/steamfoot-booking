import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({overview:vi.fn(),actor:vi.fn()}));
vi.mock('@/server/queries/customer-overview',()=>({readCourseCustomerOverview:m.overview}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.actor}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(work:()=>unknown)=>work()}));
import {isReadRequestMemoActive,memoizeReadRequest} from '@/server/services/read-request-memo';
import {GET} from '@/app/(dashboard)/dashboard/courses/customer-overview-read/route';
const request=(input:unknown)=>new Request('https://example.test/hq/dashboard/courses/customer-overview-read?args='+encodeURIComponent(JSON.stringify(input)));
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue({storeId:'store'});m.overview.mockResolvedValue({success:true,cards:{success:true,rows:[]}});});
it('reads one private snapshot through the authorized same-store loader',async()=>{
 const input={storeId:'store',customerId:'a',cards:true,bookings:true,music:true};const r=await GET(request(input));expect(await r.json()).toMatchObject({success:true});expect(m.overview).toHaveBeenCalledWith(input,expect.objectContaining({measure:expect.any(Function)}));expect(r.headers.get('server-timing')).toMatch(/total;dur=\d+/);expect(m.actor).toHaveBeenCalledWith('customer.read');expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie');
});
it('denies a switched store before reading any customer',async()=>{expect((await GET(request({storeId:'other'}))).status).toBe(403);expect(m.overview).not.toHaveBeenCalled();});
it('denies a revoked grant even if the client has a prepared snapshot',async()=>{m.actor.mockRejectedValue(Error('denied'));expect((await GET(request({storeId:'store'}))).status).toBe(403);expect(m.overview).not.toHaveBeenCalled();});
it('rejects invalid JSON before authorization or data access',async()=>{expect((await GET(new Request('https://example.test?args=broken'))).status).toBe(400);expect(m.actor).not.toHaveBeenCalled();});

it('shares repeated store metadata only inside this HTTP read and rechecks a revoked grant on the next request',async()=>{
 const metadata=vi.fn(async()=>({storeId:'store'}));
 m.actor.mockImplementation(async()=>{expect(isReadRequestMemoActive()).toBe(true);return memoizeReadRequest('store',metadata);});
 m.overview.mockImplementation(async()=>{await Promise.all([memoizeReadRequest('store',metadata),memoizeReadRequest('store',metadata)]);return {success:true};});
 expect((await GET(request({storeId:'store',customerId:'learner'}))).status).toBe(200);expect(metadata).toHaveBeenCalledOnce();expect(isReadRequestMemoActive()).toBe(false);
 expect((await GET(request({storeId:'store',customerId:'learner'}))).status).toBe(200);expect(metadata).toHaveBeenCalledTimes(2);
 m.actor.mockRejectedValueOnce(Error('revoked'));
 expect((await GET(request({storeId:'store',customerId:'learner'}))).status).toBe(403);expect(m.overview).toHaveBeenCalledTimes(2);
});
