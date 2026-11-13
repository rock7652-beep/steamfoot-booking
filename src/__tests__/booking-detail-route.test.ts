import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: mocks.detail }));
import { GET } from "@/app/api/bookings/detail/route";
import { AppError } from "@/lib/errors";
import type {OperationTiming} from "@/lib/operation-timing";
beforeEach(() => vi.resetAllMocks());
it("requires read permission before disclosing detail", async () => {
  mocks.permission.mockRejectedValue(new AppError("FORBIDDEN", "private"));
  const response = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b&storeId=s"));
  expect(mocks.permission).toHaveBeenCalledWith("booking.read", expect.objectContaining({measure:expect.any(Function)}));
  expect(response.status).toBe(403);
  expect(mocks.detail).not.toHaveBeenCalled();
});
it("requires explicit scope and retains scoped service authorization", async () => {
  const missing = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b"));
  expect(missing.status).toBe(400);
  expect(mocks.detail).not.toHaveBeenCalled();
  mocks.detail.mockResolvedValue({ booking: { id: "b" } });
  const response = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b&storeId=s"));
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith("b", "s");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ booking: { id: "b" } });
});


it('returns separated entry, detail and serialization timing without changing the payload',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 const {measureMusicRead}=await import('@/lib/music-read-timing');
 mocks.permission.mockImplementation((_code:string,timer:OperationTiming)=>timer.measure('permission.session',()=>measureMusicRead('session.staffState',async()=>({id:'private-user'}))));
 mocks.detail.mockImplementation(()=>measureMusicRead('session.staffState',async()=>({booking:{id:'private-booking',notes:'private-note'}})));
 const response=await GET(new Request('https://example.com/api/bookings/detail?bookingId=private-booking&storeId=private-store'));
 for(const label of ['total','permission_session','entryPermission','detail','serialize'])expect(response.headers.get('server-timing')).toMatch(new RegExp('(?:^|, )'+label+';dur=\\d+'));
 const reads=JSON.parse(response.headers.get('X-Booking-Read-Timing')!);
 expect(reads['entry.session.staffState.count']).toBe(1);expect(reads['detail.session.staffState.count']).toBe(1);expect(Object.values(reads).every(v=>typeof v==='number')).toBe(true);
 expect(await response.json()).toEqual({booking:{id:'private-booking',notes:'private-note'}});
 const diagnostics=JSON.stringify(log.mock.calls)+response.headers.get('server-timing')+response.headers.get('X-Booking-Read-Timing');
 for(const value of ['private-user','private-booking','private-store','private-note'])expect(diagnostics).not.toContain(value);
 log.mockRestore();
});

it.each([['UNAUTHORIZED',401],['FORBIDDEN',403],['VALIDATION',503]] as const)('preserves %s failures and logs only fixed timing labels',async(code,status)=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});mocks.permission.mockRejectedValue(new AppError(code,'secret-token-and-input'));
 const response=await GET(new Request('https://example.com/api/bookings/detail?bookingId=private&storeId=private'));
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.detail).not.toHaveBeenCalled();
 expect(await response.json()).toEqual({error:'預約明細暫時無法載入'});expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token-and-input');
 log.mockRestore();
});

it('keeps concurrent GET timing scopes separate',async()=>{
 const {measureMusicRead}=await import('@/lib/music-read-timing');vi.spyOn(console,'info').mockImplementation(()=>{});
 mocks.detail.mockImplementation((id:string)=>measureMusicRead(id==='first'?'firstRead':'secondRead',async()=>({booking:{id}})));
 const [first,second]=await Promise.all(['first','second'].map(id=>GET(new Request('https://example.com/api/bookings/detail?bookingId='+id+'&storeId=store'))));
 const a=JSON.parse(first.headers.get('X-Booking-Read-Timing')!),b=JSON.parse(second.headers.get('X-Booking-Read-Timing')!);
 expect(a['detail.firstRead.count']).toBe(1);expect(a['detail.secondRead.count']).toBeUndefined();expect(b['detail.secondRead.count']).toBe(1);expect(b['detail.firstRead.count']).toBeUndefined();
 vi.restoreAllMocks();
});
