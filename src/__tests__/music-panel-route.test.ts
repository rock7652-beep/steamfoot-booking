vi.mock("@/server/queries/music-revenue-transactions",()=>({getMusicRevenueTransactions:m.transactions}));
vi.mock("@/server/queries/course-home",()=>({getCourseReceiptTotals:m.totals}));
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),overview:vi.fn(),cards:vi.fn(),purchases:vi.fn(),bookings:vi.fn(),detail:vi.fn(),roster:vi.fn(),totals:vi.fn(),transactions:vi.fn()}));
vi.mock('@/server/queries/music-student-workspace',()=>({readMusicStudentWorkspace:m.overview}));
vi.mock('@/server/queries/course-card-browser',()=>({readCourseCards:m.cards}));
vi.mock('@/server/queries/course-customer-purchases',()=>({readCourseCustomerPurchases:m.purchases}));
vi.mock('@/server/actions/course-members',()=>({loadCourseCustomerBookings:m.bookings,loadCourseSessionDetail:m.detail,loadCourseRosterQuick:m.roster}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.auth}));
vi.mock('@/server/services/music-data-scope',()=>({musicDataSeparationEnabled:m.scope}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:m.scope}));
import {GET} from '@/app/(dashboard)/dashboard/music-read/route';
const request=(op='bookings')=>new Request('https://preview.example/s/lubymusic/admin/dashboard/music-read?'+new URLSearchParams({operation:op,args:JSON.stringify([{customerId:'student'}])}));
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({storeId:'store-lubymusic'});m.scope.mockReturnValue(true);m.bookings.mockResolvedValue({success:true,rows:[]});});
it('fails closed on authorization or environment rejection',async()=>{m.auth.mockRejectedValueOnce(new Error('denied'));expect((await GET(request())).status).toBe(400);expect(m.bookings).not.toHaveBeenCalled();m.scope.mockReturnValue(false);expect((await GET(request())).status).toBe(403);expect(m.bookings).not.toHaveBeenCalled();});
it('delegates to authorized reader and never caches private results',async()=>{const r=await GET(request());expect(m.auth).toHaveBeenCalledWith('customer.read');expect(m.bookings).toHaveBeenCalledWith({customerId:'student'},undefined,undefined);expect(r.headers.get('cache-control')).toBe('private, no-store');expect((await r.json()).success).toBe(true);});
it('rejects unknown operation without selecting arbitrary actions',async()=>{expect((await GET(request('delete'))).status).toBe(400);expect(m.bookings).not.toHaveBeenCalled();});

it.each(["session-detail","roster-quick"])("checks booking permission for %s",async(op)=>{m.detail.mockResolvedValue({success:true});m.roster.mockResolvedValue({success:true});const r=await GET(request(op));expect(r.status).toBe(200);expect(m.auth).toHaveBeenCalledWith("booking.read");expect(op==="session-detail"?m.detail:m.roster).toHaveBeenCalledOnce();});

it("authorizes finance totals and rejects invalid dates before querying",async()=>{
 const req=(from:string)=>new Request("https://preview.example/music-read?"+new URLSearchParams({operation:"revenue-totals",args:JSON.stringify([{from,to:"2026-10-16"}])}));
 expect((await GET(req("2026-02-30"))).status).toBe(400);expect(m.totals).not.toHaveBeenCalled();
 m.totals.mockResolvedValue({net:100});expect((await GET(req("2026-10-01"))).status).toBe(200);expect(m.auth).toHaveBeenCalledWith("transaction.read");expect(m.totals).toHaveBeenCalledWith("store-lubymusic","2026-10-01","2026-10-16",undefined);
});

it("scopes transaction refresh to the authenticated store and validated filters",async()=>{
 const input={from:"2026-10-01",to:"2026-10-16",dataScope:"legacy",status:"CONFIRMED",staff:"teacher",page:"2"};
 const req=(value:unknown)=>new Request("https://preview.example/music-read?"+new URLSearchParams({operation:"revenue-transactions",args:JSON.stringify([value])}));
 m.transactions.mockResolvedValue({rows:[],count:0,page:1,pages:1});
 expect((await GET(req(input))).status).toBe(200);
 expect(m.auth).toHaveBeenCalledWith("transaction.read");
 expect(m.transactions).toHaveBeenCalledWith("store-lubymusic",input);
 m.transactions.mockClear();expect((await GET(req({...input,page:"-1"}))).status).toBe(400);expect(m.transactions).not.toHaveBeenCalled();
});

it("uses the purchase reader's own dual permission and preview gate without a third authorization",async()=>{
 m.purchases.mockResolvedValue({success:true,data:[]});expect((await GET(request("purchases"))).status).toBe(200);
 expect(m.purchases).toHaveBeenCalledWith({customerId:"student"},undefined,undefined,true,expect.any(Object));expect(m.auth).not.toHaveBeenCalled();
});

it("delegates overview authorization and preview scope to its reader once",async()=>{m.overview.mockResolvedValue({success:true,data:{}});const r=await GET(request("music-student-workspace"));expect(r.status).toBe(200);expect(m.overview).toHaveBeenCalledWith({customerId:"student"},true,expect.any(Object),undefined);expect(m.auth).not.toHaveBeenCalled();expect(r.headers.get("cache-control")).toBe("private, no-store");});

it("delegates cards to its scoped dual-permission reader without outer authorization",async()=>{m.cards.mockResolvedValue({success:true,rows:[]});expect((await GET(request("course-card"))).status).toBe(200);expect(m.cards).toHaveBeenCalledWith({customerId:"student"},true,expect.any(Object));expect(m.auth).not.toHaveBeenCalled();});
