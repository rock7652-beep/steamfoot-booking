import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({ready:vi.fn(),valid:vi.fn(),save:vi.fn(),claim:vi.fn(),mark:vi.fn()}));
vi.mock('@/server/services/subscription-referral/runtime',()=>({subscriptionReferralsReady:m.ready,referralDatabase:{}}));
vi.mock('@/server/services/subscription-referral/repository',()=>({validReferralCode:m.valid}));
vi.mock('@/server/services/consultation-lead-intake',()=>({saveConsultationLead:m.save,claimConsultationDelivery:m.claim,markConsultationDelivery:m.mark,ConsultationRequestConflictError:class extends Error{}}));
vi.mock('@/server/services/consultation-lead-access',()=>({consultationDatabaseAllowed:()=>true}));
import {POST} from '@/app/pricing/submit/route';
import {payloadSchema} from '@/lib/consultation-lead';
import {GET} from '@/app/api/subscription-referrals/availability/route';
const base={requestId:'f2170225-17f8-4ad7-8031-f305afba256f',storeName:'合成推薦申請',contactName:'合成聯絡人',industry:'服務',lineId:'synthetic',needs:['預約'],replaceReason:[]};
const referred={...base,subscriptionReferralCode:' sb-abcdefgh ',subscriptionReferralConfirmed:true};
const request=(payload:unknown)=>new Request('https://www.steamfoot.com/pricing/submit',{method:'POST',headers:{origin:'https://www.steamfoot.com'},body:JSON.stringify(payload)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('CONSULTATION_HQ_ENABLED','true');vi.stubEnv('CONSULTATION_PREVIEW_INTAKE_ENABLED','false');m.ready.mockResolvedValue(true);m.valid.mockResolvedValue(true);m.save.mockResolvedValue({lead:{id:'lead',sheetStatus:'CONFIRMED'},created:true});m.claim.mockResolvedValue(true);m.mark.mockResolvedValue(true);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ok:true,saved:true})));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('subscription referral intake confirmation',()=>{
 it('normalizes explicit code input and rejects unconfirmed or malformed candidates',()=>{
  expect(payloadSchema.parse(referred).subscriptionReferralCode).toBe('SB-ABCDEFGH');
  expect(payloadSchema.safeParse({...referred,subscriptionReferralConfirmed:false}).success).toBe(false);
  expect(payloadSchema.safeParse({...referred,subscriptionReferralCode:'SB-OOOOOOOO'}).success).toBe(false);
 });
 it('checks code server-side and persists confirmed attribution in the existing immutable intake',async()=>{
  expect((await POST(request(referred))).status).toBe(200);
  expect(m.valid).toHaveBeenCalledWith({},'SB-ABCDEFGH');expect(m.save).toHaveBeenCalledWith(expect.objectContaining({subscriptionReferralCode:'SB-ABCDEFGH',subscriptionReferralConfirmed:true}),undefined);expect(fetch).not.toHaveBeenCalled();
 });
 it.each(['not-ready','invalid-code'])('does not save or deliver a %s referral',async(mode)=>{
  if(mode==='not-ready')m.ready.mockResolvedValue(false);else m.valid.mockResolvedValue(false);
  expect((await POST(request(referred))).status).toBe(mode==='not-ready'?503:400);expect(m.save).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not forward attribution to the legacy external Sheet receiver',async()=>{
  m.save.mockResolvedValue({lead:{id:'lead',sheetStatus:'PENDING'},created:true});
  expect((await POST(request({...referred,pageUrl:'https://www.steamfoot.com/apply?ref=SB-ABCDEFGH',referrer:'https://www.steamfoot.com/?ref=SB-ABCDEFGH'}))).status).toBe(200);
  const body=JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
  expect(body).not.toHaveProperty('subscriptionReferralCode');expect(body).not.toHaveProperty('subscriptionReferralConfirmed');expect(body).not.toHaveProperty('pageUrl');expect(body).not.toHaveProperty('referrer');
 });
 it('leaves normal intake independent from the referral feature and exposes only readiness',async()=>{
  m.ready.mockResolvedValue(false);expect((await POST(request(base))).status).toBe(200);expect(m.ready).not.toHaveBeenCalled();
  const response=await GET();expect(await response.json()).toEqual({enabled:false});expect(response.headers.get('cache-control')).toBe('no-store');
 });
});
