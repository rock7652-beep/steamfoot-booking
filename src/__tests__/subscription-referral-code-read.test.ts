import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({ready:vi.fn(),query:vi.fn()}));
vi.mock('@/server/services/subscription-referral/runtime',()=>({subscriptionReferralsReady:m.ready,referralDatabase:{query:m.query}}));
import {readStoreSubscriptionReferralCode} from '@/server/queries/subscription-referral-code';
beforeEach(()=>{vi.resetAllMocks();m.ready.mockResolvedValue(true);m.query.mockResolvedValue([{code:'SB-ABCDEFGH'}]);});
it('reads only the authorized store code, without creating one',async()=>{
 expect(await readStoreSubscriptionReferralCode('store-a')).toEqual({available:true,code:'SB-ABCDEFGH',readError:false});
 expect(m.query).toHaveBeenCalledExactlyOnceWith('SELECT code FROM "StoreSubscriptionReferralCode" WHERE "storeId"=$1',['store-a']);
 m.query.mockResolvedValue([]);expect(await readStoreSubscriptionReferralCode('store-a')).toMatchObject({available:true,code:null});
});
it('does not query unavailable referrals or present a failed read as an absent code',async()=>{
 m.ready.mockResolvedValue(false);expect(await readStoreSubscriptionReferralCode('a')).toEqual({available:false,code:null,readError:false});expect(m.query).not.toHaveBeenCalled();
 m.ready.mockResolvedValue(true);m.query.mockRejectedValue(new Error('private details'));expect(await readStoreSubscriptionReferralCode('a')).toEqual({available:false,code:null,readError:true});
});
it('does not offer a malformed stored code for copying or replacement',async()=>{
 m.query.mockResolvedValue([{code:'invalid'}]);expect(await readStoreSubscriptionReferralCode('a')).toEqual({available:false,code:null,readError:true});
});
