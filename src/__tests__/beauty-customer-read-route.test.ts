import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({manager:vi.fn(),support:vi.fn(),cards:vi.fn(),cash:vi.fn(),services:vi.fn(),progress:vi.fn(),next:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/server/beauty/customer-support-read',()=>({readBeautyCustomerSupport:m.support}));
vi.mock('@/server/actions/beauty-native-customers',()=>({readBeautyNativeProgressBatch:m.progress,readBeautyNativeSingleServices:m.services,browseBeautyNativeCards:m.cards,readBeautyNativeCardReservations:vi.fn(),readBeautyNativeCustomerBookings:m.next,readBeautyNativeCustomerPurchases:vi.fn(),beautyNativeCheckoutCashStatus:m.cash}));
import {POST} from '@/app/api/beauty/customer-read/route';
const request=(store='a',operation='cards')=>new NextRequest('https://example.test/api/beauty/customer-read',{method:'POST',body:JSON.stringify({store,operation,input:{customerId:'customer'}})});
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'a'});m.cards.mockResolvedValue({success:true,rows:[]});});
it('retains the existing guarded reader and provides private timing headers',async()=>{const r=await POST(request());expect(await r.json()).toEqual({success:true,rows:[]});expect(m.manager).toHaveBeenCalledWith('customer.read');expect(m.cards).toHaveBeenCalledWith({customerId:'customer'});expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('x-read-trace')).toBeTruthy();});
it('rejects cross-store receipts before reading customer or financial data',async()=>{expect((await POST(request('b'))).status).toBe(403);expect(m.cards).not.toHaveBeenCalled();expect(m.cash).not.toHaveBeenCalled();});
it('rejects revoked access before invoking a cached or combined reader',async()=>{m.manager.mockRejectedValue(Error('denied'));expect((await POST(request())).status).toBe(403);expect(m.cards).not.toHaveBeenCalled();});

it('routes bounded single-service reads through the same store authorization',async()=>{m.services.mockResolvedValue({success:true,customerId:'c',rows:[]});const req=new NextRequest('https://example.test/api/beauty/customer-read',{method:'POST',body:JSON.stringify({store:'a',operation:'services',input:'c',offset:20})});const r=await POST(req);expect(await r.json()).toMatchObject({success:true,customerId:'c'});expect(m.services).toHaveBeenCalledWith('c',20);expect(m.cash).not.toHaveBeenCalled();});

it('returns the authorized overview with grids and next service in one response',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[{id:'card'}],hasMore:false});m.next.mockResolvedValue({success:true,data:[],hasMore:false});m.progress.mockResolvedValue({success:true,rows:[{cardId:'card',result:{success:true,data:{price:500}}}]});
 const input={store:'a',operation:'overview',input:{storeId:'a',customerId:'customer',cards:true,bookings:true,music:false}};
 const r=await POST(new NextRequest('https://example.test/api/beauty/customer-read',{method:'POST',body:JSON.stringify(input)}));
 expect(await r.json()).toMatchObject({success:true,cards:{rows:[{id:'card'}]},next:{data:[]},beautyProgress:[{cardId:'card'}]});expect(m.progress).toHaveBeenCalledWith({expectedStoreId:'a',customerId:'customer',cardIds:['card']});expect(m.next).toHaveBeenCalledWith('customer',0,{mode:'upcoming'});
});
it('retains a failed grid read instead of reporting an empty or zero-balance overview',async()=>{
 m.cards.mockResolvedValue({success:true,rows:[{id:'card'}],hasMore:false});m.next.mockResolvedValue({success:true,data:[]});m.progress.mockResolvedValue({success:false,error:'denied'});
 const r=await POST(new NextRequest('https://example.test/api/beauty/customer-read',{method:'POST',body:JSON.stringify({store:'a',operation:'overview',input:{storeId:'a',customerId:'customer',cards:true,bookings:true}})}));
 expect(await r.json()).toMatchObject({beautyProgress:[{cardId:'card',result:{success:false,error:'denied'}}]});
});
