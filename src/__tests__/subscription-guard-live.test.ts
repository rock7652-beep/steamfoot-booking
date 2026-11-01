import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({store:vi.fn(),fallback:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store},storeSubscription:{findFirst:m.fallback}}}));
import {isStoreSubscriptionWriteBlocked,assertStoreSubscriptionWritable} from '@/lib/subscription-guard';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
beforeEach(()=>{vi.resetAllMocks();m.store.mockResolvedValue({currentSubscription:null});m.fallback.mockResolvedValue(null);});
it('joins the one-to-one current subscription and retains expiry denial without querying another subscription',async()=>{
 m.store.mockResolvedValue({currentSubscription:{status:'ACTIVE',expiresAt:new Date('2000-01-01')}});
 await expect(assertStoreSubscriptionWritable('s')).rejects.toThrow('使用期限已到期');expect(m.fallback).not.toHaveBeenCalled();
 expect(m.store).toHaveBeenCalledWith({relationLoadStrategy:'join',where:{id:'s'},select:{currentSubscription:{select:{status:true,expiresAt:true}}}});
});
it('keeps subscription state fresh even in one explicit read scope',async()=>{
 m.store.mockResolvedValueOnce({currentSubscription:{status:'ACTIVE',expiresAt:new Date('2000-01-01')}}).mockResolvedValueOnce({currentSubscription:{status:'ACTIVE',expiresAt:new Date('2099-01-01')}});
 await withReadRequestMemo(async()=>{expect(await isStoreSubscriptionWriteBlocked('s')).toBe(true);expect(await isStoreSubscriptionWriteBlocked('s')).toBe(false);});expect(m.store).toHaveBeenCalledTimes(2);
});
it('retains latest-row fallback and its ordering when there is no current subscription',async()=>{
 m.fallback.mockResolvedValue({status:'ACTIVE',expiresAt:new Date('2000-01-01')});expect(await isStoreSubscriptionWriteBlocked('s')).toBe(true);
 expect(m.fallback).toHaveBeenCalledWith({where:{storeId:'s'},orderBy:{createdAt:'desc'},select:{status:true,expiresAt:true}});
});
it('preserves the established behavior for absent subscriptions and database failures',async()=>{
 expect(await isStoreSubscriptionWriteBlocked('s')).toBe(false);m.store.mockRejectedValueOnce(new Error('unavailable'));expect(await isStoreSubscriptionWriteBlocked('s')).toBe(false);
});
