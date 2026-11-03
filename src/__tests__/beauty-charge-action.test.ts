import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),transaction:vi.fn(),audit:vi.fn(),service:vi.fn(),techs:vi.fn(),raw:vi.fn(),write:vi.fn(),create:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,audit:m.audit,command:async(_tx:unknown,_a:unknown,_key:unknown,_payload:unknown,work:()=>unknown)=>work()}));
import {saveBeautyCharge} from '@/server/actions/beauty-charge';
const single={expectedStoreId:'store',kind:'single',serviceId:'s',name:'獨立收費名稱',price:1000,sessions:1,trialPrice:0,trialMinutes:45,technicianIds:['t']};
const input={draft:single,expectedRevision:2,requestKey:'11111111-1111-4111-8111-111111111111'};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEAUTY_CHARGE_RULES_ENABLED','1');vi.stubEnv('BEAUTY_CHARGE_EDITING_ENABLED','1');vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','store');m.manager.mockResolvedValue({storeId:'store',userId:'u'});m.service.mockResolvedValue([{id:'s',name:'服務原名',active:true,duration:60,buffer:15}]);m.techs.mockResolvedValue([{id:'t',storeId:'store',active:true,serviceIds:['s']}]);m.raw.mockResolvedValue([{id:'s',revision:2,chargeTechnicianRule:null,singlePriceConfigured:null,singleChargeName:null}]);m.write.mockResolvedValue(1);m.create.mockImplementation(async({data})=>data);m.transaction.mockImplementation((_a,work)=>work({beautyService:{findMany:m.service},beautyTechnician:{findMany:m.techs},beautyPlan:{create:m.create},$queryRaw:m.raw,$executeRaw:m.write}));});
afterEach(()=>vi.unstubAllEnvs());
it('saves single price/name/trial/rule together without changing service name or qualifications',async()=>{expect(await saveBeautyCharge(input)).toMatchObject({success:true,data:{id:'s',revision:3}});const sql=m.write.mock.calls[0][0].join('');expect(sql).toContain('"singleChargeName"');expect(sql).not.toContain(' SET name=');expect(sql).not.toContain('"BeautyTechnician"');expect(m.write.mock.calls[0]).toContain('獨立收費名稱');expect(m.write.mock.calls[0]).toContain(45);expect(m.permission).toHaveBeenCalledWith('staff.view');});
it('creates a multi-session plan at the full price without trial fields or multiplying price',async()=>{const draft={expectedStoreId:single.expectedStoreId,serviceId:single.serviceId,name:single.name,technicianIds:single.technicianIds,kind:'plan',sessions:5,price:4500,validDays:90,allowShared:false};expect(await saveBeautyCharge({...input,draft,expectedRevision:0})).toMatchObject({success:true,data:{kind:'plan',revision:1}});expect(m.create.mock.calls[0][0].data).toMatchObject({price:4500,sessions:5,serviceIds:['s']});expect(m.write.mock.calls[0][0].join('')).not.toContain('trial');});
it('rejects unavailable, foreign, stale and invalid requests before any write',async()=>{for(const changed of [{...input,expectedRevision:1},{...input,draft:{...single,expectedStoreId:'foreign'}},{...input,draft:{...single,technicianIds:['foreign']}}])expect(await saveBeautyCharge(changed)).toMatchObject({success:false});expect(m.write).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
it('requires both the feature and explicit store allowlist, and never retries a failed compare-and-swap',async()=>{vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','other');expect(await saveBeautyCharge(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();vi.stubEnv('BEAUTY_CHARGE_RULES_STORE_IDS','store');m.write.mockResolvedValue(0);expect(await saveBeautyCharge(input)).toMatchObject({success:false});expect(m.write).toHaveBeenCalledTimes(1);});
it('rejects missing staff read permission before any transaction',async()=>{m.permission.mockRejectedValue(Error('denied'));expect(await saveBeautyCharge(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();});

it('can stop charge editing without disabling existing booking enforcement',async()=>{vi.stubEnv('BEAUTY_CHARGE_EDITING_ENABLED','0');expect(await saveBeautyCharge(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();const {beautyChargeRulesEnabled}=await import('@/server/beauty/charge-runtime');expect(beautyChargeRulesEnabled('store')).toBe(true);});

it('accepts the first explicit price in a production Beauty store without a manual store allowlist',async()=>{
 for(const [key,value] of Object.entries({BEAUTY_CHARGE_RULES_SCOPE:'module',BEAUTY_CHARGE_RULES_STORE_IDS:'',BEAUTY_MODULE_ENABLED:'1',BEAUTY_DATABASE_MODE:'dedicated',BEAUTY_DATABASE_ROLE:'steamfoot_beauty_prod_20261025',VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking'}))vi.stubEnv(key,value);
 expect(await saveBeautyCharge(input)).toMatchObject({success:true,data:{id:'s',revision:3}});expect(m.write).toHaveBeenCalledOnce();
});

it('persists the explicit zero trial fee in the same authorized revision audit',async()=>{
 expect(await saveBeautyCharge({...input,draft:{...single,storeCost:300,trialStoreCost:0}})).toMatchObject({success:true});
 expect(m.audit).toHaveBeenCalledWith(expect.anything(),expect.anything(),'CHARGE_SETTING',expect.any(String));
 const call=m.audit.mock.calls.find(c=>c[2]==='CHARGE_SETTING')!;
 expect(JSON.parse(call[3])).toMatchObject({id:'s',kind:'single',revision:3,storeCost:300,trialStoreCost:0});
});
