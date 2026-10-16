import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),overview:vi.fn(),cards:vi.fn(),purchases:vi.fn(),bookings:vi.fn(),detail:vi.fn(),roster:vi.fn()}));
vi.mock('@/server/actions/music-student-workspace',()=>({loadMusicStudentWorkspace:m.overview}));
vi.mock('@/server/actions/course-browse',()=>({browseCourseCards:m.cards}));
vi.mock('@/server/actions/course-customer-history',()=>({loadCourseCustomerPurchases:m.purchases}));
vi.mock('@/server/actions/course-members',()=>({loadCourseCustomerBookings:m.bookings,loadCourseSessionDetail:m.detail,loadCourseRosterQuick:m.roster}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.auth}));
vi.mock('@/server/services/music-data-scope',()=>({musicDataSeparationEnabled:m.scope}));
import {GET} from '@/app/(dashboard)/dashboard/music-read/route';
const request=(op='course-card')=>new Request('https://preview.example/s/lubymusic/admin/dashboard/music-read?'+new URLSearchParams({operation:op,args:JSON.stringify([{customerId:'student'}])}));
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({storeId:'store-lubymusic'});m.scope.mockReturnValue(true);m.cards.mockResolvedValue({success:true,rows:[]});});
it('fails closed on authorization or environment rejection',async()=>{m.auth.mockRejectedValueOnce(new Error('denied'));expect((await GET(request())).status).toBe(400);expect(m.cards).not.toHaveBeenCalled();m.scope.mockReturnValue(false);expect((await GET(request())).status).toBe(403);expect(m.cards).not.toHaveBeenCalled();});
it('delegates to authorized reader and never caches private results',async()=>{const r=await GET(request());expect(m.auth).toHaveBeenCalledWith('customer.read');expect(m.cards).toHaveBeenCalledWith({customerId:'student'});expect(r.headers.get('cache-control')).toBe('private, no-store');expect((await r.json()).success).toBe(true);});
it('rejects unknown operation without selecting arbitrary actions',async()=>{expect((await GET(request('delete'))).status).toBe(400);expect(m.cards).not.toHaveBeenCalled();});

it.each(["session-detail","roster-quick"])("checks booking permission for %s",async(op)=>{m.detail.mockResolvedValue({success:true});m.roster.mockResolvedValue({success:true});const r=await GET(request(op));expect(r.status).toBe(200);expect(m.auth).toHaveBeenCalledWith("booking.read");expect(op==="session-detail"?m.detail:m.roster).toHaveBeenCalledOnce();});
