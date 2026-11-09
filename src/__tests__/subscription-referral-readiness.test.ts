import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRawUnsafe:m.query,$transaction:vi.fn()}}));
import {subscriptionReferralsReady} from '@/server/services/subscription-referral/runtime';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SUBSCRIPTION_REFERRALS_ENABLED','false');vi.stubEnv('CONSULTATION_HQ_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());
describe('subscription referral activation gate',()=>{
 it('does no database work while disabled',async()=>{expect(await subscriptionReferralsReady()).toBe(false);expect(m.query).not.toHaveBeenCalled();});
 it('requires durable intake and actual table/column/grant readiness',async()=>{
  vi.stubEnv('SUBSCRIPTION_REFERRALS_ENABLED','true');vi.stubEnv('CONSULTATION_HQ_ENABLED','false');expect(await subscriptionReferralsReady()).toBe(false);expect(m.query).not.toHaveBeenCalled();
  vi.stubEnv('CONSULTATION_HQ_ENABLED','true');m.query.mockRejectedValueOnce(new Error('missing schema'));expect(await subscriptionReferralsReady()).toBe(false);
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ready:true}]);expect(await subscriptionReferralsReady()).toBe(true);expect(m.query.mock.calls.at(-2)?.[0]).toContain('LIMIT 0');
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ready:false}]);expect(await subscriptionReferralsReady()).toBe(false);
 });
});
