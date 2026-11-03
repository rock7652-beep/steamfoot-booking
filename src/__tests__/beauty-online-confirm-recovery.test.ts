import {describe,expect,it,vi} from 'vitest';
import {createBeautyOnlineConfirmRecovery,type OnlineConfirmEntry,type OnlineConfirmPort} from '@/lib/beauty-online-confirm-recovery';
const k='11111111-1111-4111-8111-111111111111';
const base={orderId:'order',requestKey:k,customerName:'顧客',planName:'方案',amount:800,canCommit:true};
const prepared={...base,status:'PREPARED' as const,purchaseId:null};
const committed={...base,status:'COMMITTED' as const,purchaseId:'card'};
function storage(){const map=new Map<string,string>();return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k),map};}
function ports(){return {list:vi.fn().mockResolvedValue({success:true,data:[]}),read:vi.fn().mockResolvedValue({success:true,data:null}),prepare:vi.fn().mockResolvedValue({success:true,data:prepared}),commit:vi.fn().mockResolvedValue({success:true,data:committed}),cancel:vi.fn().mockResolvedValue({success:true,data:{...prepared,status:'CANCELLED'}}),acknowledge:vi.fn().mockResolvedValue({success:true,data:{...committed,status:'ACKNOWLEDGED'}})} satisfies OnlineConfirmPort;}
describe('online confirmation recovery',()=>{
 it('records a pointer before registration and retains it across lost responses and reload',async()=>{
  const s=storage(),p=ports();p.prepare.mockRejectedValueOnce(Error('lost'));
  const c=createBeautyOnlineConfirmRecovery({storeId:'s',userId:'u',storage:s,randomUUID:()=>k,port:p});
  expect(await c.start('order')).toEqual({kind:'uncertain',reason:'network'});
  expect([...s.map.values()]).toEqual([JSON.stringify({orderId:'order',requestKey:k})]);
  const reloaded=createBeautyOnlineConfirmRecovery({storeId:'s',userId:'u',storage:s,randomUUID:()=>k,port:p});
  expect(await reloaded.inspect()).toEqual({kind:'ready',entries:[],localMissing:{orderId:'order',requestKey:k}});
  expect(await reloaded.start('another')).toMatchObject({kind:'ready',localMissing:{orderId:'order'}});
  expect(p.prepare).toHaveBeenCalledTimes(1);
  expect(await reloaded.cancel({orderId:'order',requestKey:k})).toMatchObject({kind:'ready',entries:[{status:'CANCELLED'}]});
 });
 it('finds an unacknowledged server commit even when the pending order row disappeared',async()=>{
  const s=storage(),p=ports();p.list.mockResolvedValue({success:true,data:[committed]});
  const c=createBeautyOnlineConfirmRecovery({storeId:'s',userId:'u',storage:s,randomUUID:()=>k,port:p});
  expect(await c.inspect()).toMatchObject({kind:'ready',entries:[{status:'COMMITTED',orderId:'order'}]});
  expect(await c.start('another')).toMatchObject({kind:'ready',entries:[{status:'COMMITTED'}]});
  p.list.mockResolvedValueOnce({success:true,data:[]});
  expect(await c.acknowledge({orderId:'order',requestKey:k})).toMatchObject({kind:'ready',entries:[]});
  expect(p.acknowledge).toHaveBeenCalledWith({expectedStoreId:'s',orderId:'order',requestKey:k});
 });
 it('scopes stored pointers by user and store and never stores financial fields',async()=>{
  const s=storage(),p=ports();const options={storage:s,randomUUID:()=>k,port:p};
  await createBeautyOnlineConfirmRecovery({...options,storeId:'s',userId:'u'}).start('order');
  expect(await createBeautyOnlineConfirmRecovery({...options,storeId:'s',userId:'other'}).inspect()).toEqual({kind:'ready',entries:[],localMissing:null});
  expect([...s.map.values()][0]).not.toContain('顧客');expect([...s.map.values()][0]).not.toContain('800');
 });
 it('rejects malformed states and does not clear a cancellation without a fresh server read',async()=>{
  const s=storage(),p=ports();const c=createBeautyOnlineConfirmRecovery({storeId:'s',userId:'u',storage:s,randomUUID:()=>k,port:p});
  await c.start('order');p.read.mockResolvedValueOnce({success:true,data:prepared});
  expect(await c.clearCancelled({orderId:'order',requestKey:k})).toEqual({kind:'uncertain',reason:'protocol'});
  expect(s.map.size).toBe(1);
  p.list.mockResolvedValueOnce({success:true,data:[{...committed,purchaseId:null} as unknown as OnlineConfirmEntry]});
  expect(await c.inspect()).toEqual({kind:'uncertain',reason:'protocol'});
 });
});
