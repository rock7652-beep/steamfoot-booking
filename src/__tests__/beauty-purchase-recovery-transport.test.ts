import { describe, expect, it, vi } from 'vitest';
import { beautyPlanCheckoutInput, beautyPlanRecoveryTransport } from '@/lib/beauty-purchase-recovery-transport';

const key='11111111-1111-4111-8111-111111111111';
const committed={status:'COMMITTED' as const,requestKey:key,purchaseId:'card-1'};
function ports(){return {
 prepare:vi.fn().mockResolvedValue({success:true,data:{status:'PREPARED',requestKey:key,purchaseId:null}}),
 prepareAtomic:vi.fn().mockResolvedValue({success:true,data:{kind:'prepared',intent:{status:'PREPARED',requestKey:key,purchaseId:null}}}),
 read:vi.fn().mockResolvedValue({success:true,data:committed}),
 cancel:vi.fn().mockResolvedValue({success:true,data:{status:'CANCELLED',requestKey:key,purchaseId:null}}),
 acknowledge:vi.fn().mockResolvedValue({success:true,data:{...committed,status:'ACKNOWLEDGED'}}),
};}
describe('beauty plan recovery transport',()=>{
 it('normalizes the exact same checkout fields for prepare and actual submission',async()=>{
  const p=ports(),t=beautyPlanRecoveryTransport('store-1','roster-1',p);
  const input={customerId:'c',requestKey:key,expectedStoreCost:99,transferLastFour:'1234',paymentMethod:'BANK_TRANSFER'};
  await t.prepare(input,key);
  expect(p.prepare).toHaveBeenCalledWith(beautyPlanCheckoutInput(input,'store-1','roster-1'));
  expect(p.prepare.mock.calls[0][0]).toMatchObject({expectedStoreCost:0,expectedStoreId:'store-1',beautyRosterSessionId:'roster-1'});
 });
 it('passes identical scoped checkout data to the atomic prepare and preserves existing intent',async()=>{
  const p=ports(),t=beautyPlanRecoveryTransport('store-1','roster-1',p);
  p.prepareAtomic.mockResolvedValueOnce({success:true,data:{kind:'existing',intent:{status:'COMMITTED',requestKey:key,purchaseId:'card'}}});
  const input={customerId:'c',requestKey:key,expectedStoreCost:99,paymentMethod:'CARD'};
  expect(await t.prepareAtomic!(input,key)).toEqual({success:true,data:{kind:'existing',intent:{status:'COMMITTED',requestKey:key,purchaseId:'card'}}});
  expect(p.prepareAtomic).toHaveBeenCalledWith(beautyPlanCheckoutInput(input,'store-1','roster-1'));
 });
 it('queries only the selected store and learns already acknowledged results as committed',async()=>{
  const p=ports(),t=beautyPlanRecoveryTransport('store-1',undefined,p);
  p.read.mockResolvedValueOnce({success:true,data:{...committed,status:'ACKNOWLEDGED'}});
  expect(await t.get('c',key)).toEqual({success:true,data:committed});
  expect(p.read).toHaveBeenCalledWith({customerId:'c',expectedStoreId:'store-1',requestKey:key});
  await t.getPending('c');expect(p.read).toHaveBeenLastCalledWith({customerId:'c',expectedStoreId:'store-1'});
 });
 it('confirms with the server-selected card and rejects mismatched acknowledgement',async()=>{
  const p=ports(),t=beautyPlanRecoveryTransport('store-1',undefined,p);
  expect(await t.acknowledge('c',key)).toEqual({success:true,data:committed});
  expect(p.acknowledge).toHaveBeenCalledWith({customerId:'c',expectedStoreId:'store-1',requestKey:key,purchaseId:'card-1'});
  p.acknowledge.mockResolvedValueOnce({success:true,data:{...committed,status:'ACKNOWLEDGED',purchaseId:'wrong'}});
  expect((await t.acknowledge('c',key)).success).toBe(false);
 });
 it('does not acknowledge when status is missing, unresolved or denied',async()=>{
  const p=ports(),t=beautyPlanRecoveryTransport('store-1',undefined,p);
  for(const data of [null,{status:'PREPARED',requestKey:key,purchaseId:null}]){
    p.read.mockResolvedValueOnce({success:true,data});expect((await t.acknowledge('c',key)).success).toBe(false);
  }
  p.read.mockResolvedValueOnce({success:false,error:'無權限'});expect(await t.acknowledge('c',key)).toEqual({success:false,error:'無權限'});
  expect(p.acknowledge).not.toHaveBeenCalled();
 });
});
