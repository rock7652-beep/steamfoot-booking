import {beforeEach,expect,it,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/booking-client-transport',()=>({readBookingDetail:read}));
import {createBookingDetailCache} from '@/app/(dashboard)/dashboard/bookings/booking-detail-cache';
import {createCustomerReadQueue} from '@/lib/customer-read-queue';
import type {BookingDrawerPayload} from '@/server/actions/booking-drawer';
const payload=(id:string)=>({booking:{id}} as BookingDrawerPayload);
const tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
beforeEach(()=>{vi.useRealTimers();read.mockReset();});
it('warms the complete day and lets the twentieth booking bypass queued background reads',async()=>{
 const started:string[]=[],finish=new Map<string,()=>void>();
 read.mockImplementation((id:string)=>new Promise<BookingDrawerPayload>(yes=>{started.push(id);finish.set(id,()=>yes(payload(id)));}));
 const cache=createBookingDetailCache('store'),all=Array.from({length:20},(_,i)=>cache.prefetch(String(i)));
 await tick();expect(started).toEqual(['0']);
 const clicked=cache.load('19');expect(clicked).toBe(all[19]);await tick();expect(started).toEqual(['0','19']);
 finish.get('19')!();await clicked;expect(cache.get('19')).toEqual(payload('19'));
 finish.get('0')!();await tick();
 for(let i=1;i<19;i++){finish.get(String(i))!();await tick();}await Promise.all(all);
 expect(started).toHaveLength(20);expect(read).toHaveBeenCalledWith('19','store');
});
it('cancels waiting day work but preserves an intent-promoted booking and retries failures',async()=>{
 let finish!:()=>void;read.mockImplementation((id:string)=>id==='a'?new Promise<BookingDrawerPayload>(yes=>{finish=()=>yes(payload(id));}):Promise.resolve(payload(id)));
 const cache=createBookingDetailCache('store'),a=cache.prefetch('a'),b=cache.prefetch('b').catch(()=>null),c=cache.prefetch('c');
 cache.prefetch('c',true);cache.cancelPrefetch(['a','b','c']);await tick();
 expect(await b).toBeNull();expect(await c).toEqual(payload('c'));expect(read.mock.calls.map(x=>x[0])).toEqual(['a','c']);finish();await a;
 read.mockRejectedValueOnce(new Error('offline'));await expect(cache.load('b')).rejects.toThrow('offline');expect(cache.get('b')).toBeUndefined();
 read.mockResolvedValueOnce(payload('b'));await expect(cache.load('b')).resolves.toEqual(payload('b'));
});
it('does not reinstall invalidated in-flight results and reads a new version',async()=>{
 let finish!:(v:BookingDrawerPayload)=>void;read.mockImplementationOnce(()=>new Promise<BookingDrawerPayload>(yes=>{finish=yes;}));
 const cache=createBookingDetailCache('store'),old=cache.prefetch('a');await tick();cache.invalidate('a');
 read.mockResolvedValueOnce(payload('fresh'));await expect(cache.load('a')).resolves.toEqual(payload('fresh'));
 finish(payload('old'));await old;await tick();expect(cache.get('a')).toEqual(payload('fresh'));
});
it('shares concurrency across stores without sharing cache entries and revalidates expired prefetch',async()=>{
 vi.useFakeTimers();read.mockImplementation(async(id:string)=>payload(id));const queue=createCustomerReadQueue();
 const a=createBookingDetailCache('a',queue),b=createBookingDetailCache('b',queue);await a.prefetch('id');await a.prefetch('id');expect(read).toHaveBeenCalledTimes(1);
 await b.prefetch('id');expect(read).toHaveBeenLastCalledWith('id','b');
 vi.advanceTimersByTime(15_001);expect(a.get('id')).toBeDefined();expect(a.getFresh('id')).toBeUndefined();await a.prefetch('id');expect(read).toHaveBeenCalledTimes(3);await tick();
 await a.load('id');expect(read).toHaveBeenCalledTimes(4);vi.useRealTimers();
});
