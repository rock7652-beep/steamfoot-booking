import { beforeEach,describe,it,expect,vi } from "vitest";
const m=vi.hoisted(()=>({admin:vi.fn(),staff:vi.fn(),permission:vi.fn(),role:vi.fn(),store:vi.fn(),ready:vi.fn(),code:vi.fn(),bind:vi.fn(),verify:vi.fn(),apply:vi.fn(),both:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/session',()=>({requireAdminSession:m.admin,requireStaffSession:m.staff}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/hq-store-view-context',()=>({getEffectiveActorRole:m.role}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.store}));
vi.mock('@/lib/revalidation',()=>({revalidateStorePlan:vi.fn(),revalidateShopConfig:vi.fn()}));
vi.mock('@/server/services/subscription-referral/runtime',()=>({referralDatabase:{},requireSubscriptionReferralsReady:m.ready}));
vi.mock('@/server/services/subscription-referral/repository',()=>({ensureReferralCode:m.code,bindReferralLead:m.bind,verifyReferralPayment:m.verify,applyReferralReward:m.apply,applyReferralRewards:m.both}));
import { createMySubscriptionReferralCode,bindSubscriptionReferral,verifySubscriptionReferral,applySubscriptionReferralReward,applyBothSubscriptionReferralRewards } from '@/server/actions/subscription-referral';
const both={referralId:'relation',referrerExpiresOn:'2026-11-20',referredExpiresOn:'2026-11-30',referredBillingReference:'monthly-check',billingConfirmed:'on'};
const initial={success:false,message:''};
function form(values:Record<string,string>){const f=new FormData();for(const [key,value]of Object.entries(values))f.set(key,value);return f;}
const bind={leadId:'lead',storeId:'b',confirmed:'on'};
const verify={commandId:'d8da8096-2874-49da-86aa-cd14bf291bdc',referralId:'relation',subscriptionId:'sub-b',receiptRef:'receipt',settledAt:'2026-10-01T10:00',distinctOperator:'on',firstPaymentConfirmed:'on',refundStatus:'CLEAR',verificationRef:'bank-check'};
const apply={rewardId:'reward',expectedExpiresOn:'2026-11-30',billingReference:'billing-check',billingConfirmed:'on'};
beforeEach(()=>{vi.resetAllMocks();m.admin.mockResolvedValue({id:'hq',role:'ADMIN'});m.staff.mockResolvedValue({id:'owner',role:'OWNER'});m.role.mockImplementation(user=>user.role);m.store.mockResolvedValue('owned-store');m.ready.mockResolvedValue(undefined);m.permission.mockResolvedValue(undefined);m.code.mockResolvedValue('SB-ABCDEFGH');m.bind.mockResolvedValue({id:'relation'});m.verify.mockResolvedValue({message:'已核對'});m.apply.mockResolvedValue({message:'已發放'});m.both.mockResolvedValue({message:'雙方已發放'});});
describe('subscription referral action authority',()=>{
 it('derives code ownership from the authenticated store and rejects injected IDs',async()=>{
  expect(await createMySubscriptionReferralCode(initial,new FormData())).toMatchObject({success:true,code:'SB-ABCDEFGH'});
  expect(m.code).toHaveBeenCalledWith({},'owned-store','owner');
  m.code.mockClear();expect((await createMySubscriptionReferralCode(initial,form({storeId:'other-store'}))).success).toBe(false);expect(m.code).not.toHaveBeenCalled();
 });
 it('blocks staff and enforces feature readiness before code writes',async()=>{
  m.staff.mockResolvedValue({id:'staff',role:'STAFF'});expect((await createMySubscriptionReferralCode(initial,new FormData())).success).toBe(false);expect(m.code).not.toHaveBeenCalled();
  m.staff.mockResolvedValue({id:'owner',role:'OWNER'});m.ready.mockRejectedValue(new Error('活動未開通'));expect((await createMySubscriptionReferralCode(initial,new FormData())).success).toBe(false);expect(m.code).not.toHaveBeenCalled();
 });
 it.each(['session','store-view','permission','readiness'])('blocks all HQ writes when %s is not authorized',async(mode)=>{
  if(mode==='session')m.admin.mockRejectedValue(new Error('無總部權限'));
  if(mode==='store-view')m.role.mockReturnValue('OWNER');
  if(mode==='permission')m.permission.mockRejectedValue(new Error('無管理權限'));
  if(mode==='readiness')m.ready.mockRejectedValue(new Error('資料表未就緒'));
  for(const [action,values]of [[bindSubscriptionReferral,bind],[verifySubscriptionReferral,verify],[applySubscriptionReferralReward,apply],[applyBothSubscriptionReferralRewards,both]]as const)expect((await action(initial,form(values))).success).toBe(false);
  expect(m.bind).not.toHaveBeenCalled();expect(m.verify).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();expect(m.both).not.toHaveBeenCalled();
 });
 it('requires explicit checks and parses receipt time in Taiwan before verification',async()=>{
  expect((await bindSubscriptionReferral(initial,form({...bind,confirmed:''}))).success).toBe(false);expect(m.bind).not.toHaveBeenCalled();
  expect((await verifySubscriptionReferral(initial,form({...verify,firstPaymentConfirmed:''}))).success).toBe(false);expect(m.verify).not.toHaveBeenCalled();
  expect((await verifySubscriptionReferral(initial,form(verify))).success).toBe(true);
  expect(m.verify.mock.calls[0][2]).toMatchObject({settledAt:new Date('2026-10-01T02:00:00Z'),distinctOperator:true,firstPaymentConfirmed:true,refunded:false});
 });
 it('does not leak raw database errors to the client',async()=>{
  m.bind.mockRejectedValue(new Error('permission denied for secret_table'));
  const result=await bindSubscriptionReferral(initial,form(bind));expect(result.success).toBe(false);expect(result.message).not.toContain('secret_table');
 });
 it('submits the pair using HQ authority, preserving separate expiry and billing checks',async()=>{
  expect((await applyBothSubscriptionReferralRewards(initial,form(both))).success).toBe(true);
  expect(m.both).toHaveBeenCalledWith({},'hq',{referralId:'relation',referrer:{expectedExpiresOn:'2026-11-20',billingReference:undefined},referred:{expectedExpiresOn:'2026-11-30',billingReference:'monthly-check'},billingConfirmed:true},expect.any(Date));
  m.both.mockClear();expect((await applyBothSubscriptionReferralRewards(initial,form({...both,referredExpiresOn:'bad'}))).success).toBe(false);expect(m.both).not.toHaveBeenCalled();
 });

});

it('rejects an inline creation if the active store changed, while preserving legacy creation',async()=>{
 expect((await createMySubscriptionReferralCode(initial,form({expectedStoreId:'other-store'}))).success).toBe(false);expect(m.code).not.toHaveBeenCalled();
 expect((await createMySubscriptionReferralCode(initial,form({expectedStoreId:'owned-store'}))).success).toBe(true);expect(m.code).toHaveBeenCalledOnce();
});
