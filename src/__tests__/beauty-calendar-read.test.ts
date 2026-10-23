import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({context:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/store-context',()=>({getStoreContext:m.context}));
vi.mock('@/server/beauty/queries',()=>({beautyCalendar:m.read}));
import {GET} from '@/app/api/beauty/calendar/route';
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue({storeSlug:'test'});m.read.mockResolvedValue({date:'2026-10-22',calendar:'month',items:[],calendarDays:{},customers:[{secret:'must-not-return'}],report:{}});});
const request=(args='date=2026-10-22&calendar=month&store=test')=>new NextRequest('https://example.test/api/beauty/calendar?'+args);
it('uses the calendar-only guarded reader and excludes unrelated customer/finance payloads',async()=>{const r=await GET(request());expect(r.headers.get('cache-control')).toBe('private, no-store');expect(m.read).toHaveBeenCalledWith('2026-10-22','month');expect(await r.json()).toEqual({success:true,data:{date:'2026-10-22',calendar:'month',items:[],calendarDays:{}}});});
it('rejects wrong stores and invalid dates before loading data',async()=>{expect((await GET(request('date=2026-10-22&calendar=month&store=other'))).status).toBe(403);expect((await GET(request('date=2026-02-31&calendar=month&store=test'))).status).toBe(403);expect(m.read).not.toHaveBeenCalled();});
it('does not expose data when authorization is revoked',async()=>{m.read.mockRejectedValue(Error('denied'));const r=await GET(request());expect(r.status).toBe(403);expect(await r.json()).not.toHaveProperty('data');});
it('retains authorized rentals when the calendar transport refreshes',async()=>{
 m.read.mockResolvedValue({date:'2026-10-22',calendar:'month',items:[],calendarDays:{},rentals:[{id:'rental',customerName:'空間租借'}],customers:[{secret:'must-not-return'}]});
 const data=(await (await GET(request())).json()).data;
 expect(data.rentals).toEqual([{id:'rental',customerName:'空間租借'}]);expect(data).not.toHaveProperty('customers');
});
it('requests the native padded month only through the same store guard',async()=>{
 expect((await GET(request('date=2026-10-22&calendar=month&store=test&native=1'))).status).toBe(200);
 expect(m.read).toHaveBeenCalledWith('2026-10-22','month',true);m.read.mockClear();
 expect((await GET(request('date=2026-10-22&calendar=day&store=test&native=1'))).status).toBe(403);
 expect((await GET(request('date=2026-10-22&calendar=month&store=other&native=1'))).status).toBe(403);expect(m.read).not.toHaveBeenCalled();
});
