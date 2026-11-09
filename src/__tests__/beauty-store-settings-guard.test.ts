import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),transaction:vi.fn(),beautyTransaction:vi.fn(),save:undefined as undefined|((v:unknown)=>Promise<unknown>)}));
vi.mock('@/server/services/settings-save-route',()=>({settingsSavePOST:(_schema:unknown,save:(v:unknown)=>Promise<unknown>)=>{m.save=save;return vi.fn();}}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.actor,beautyTransaction:m.beautyTransaction,audit:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({settings:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/subscription-guard',()=>({assertStoreSubscriptionWritable:vi.fn()}));
vi.mock('@/server/services/operation-audit-outbox',()=>({enqueueOperationAudit:vi.fn()}));
vi.mock('@/lib/revalidation',()=>({revalidateShopConfigInRoute:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import '@/app/api/beauty/settings/store/route';
import {courseSettingsSectionRevision} from '@/lib/course-settings-sections';
const values={section:'store',name:'測試店',address:'',shopPhone:'',mapUrl:'',lineOfficialId:'',lineOfficialUrl:''};
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue({storeId:'test',userId:'owner'});});
it('requires a writable beauty manager and matching store before touching shared store data',async()=>{
 const r=await m.save!({values,expectedStoreId:'other',expectedRevision:'old',requestKey:crypto.randomUUID()});expect(r).toMatchObject({success:false});expect(m.actor).toHaveBeenCalledWith('business_hours.manage',true);expect(m.transaction).not.toHaveBeenCalled();
});
it.each(['booking','payment'])('rejects a cross-store %s editor before any transaction',async section=>{const values=section==='booking'?{section,bookingLeadMinutes:0,cancellationLeadMinutes:0}:{section,bankName:'',bankCode:'',bankAccountNumber:''};const r=await m.save!({values,expectedStoreId:'other'});expect(r).toMatchObject({success:false});expect(m.actor).toHaveBeenCalledWith(section==='booking'?'business_hours.manage':'plans.edit',true);expect(m.transaction).not.toHaveBeenCalled();expect(m.beautyTransaction).not.toHaveBeenCalled();});
it('rejects a stale shared-store draft without updating any row',async()=>{
 const storeUpdate=vi.fn(),configUpdate=vi.fn();m.transaction.mockImplementation(async work=>work({$queryRaw:vi.fn(),store:{findUniqueOrThrow:vi.fn().mockResolvedValue({name:'已被其他人改名'}),update:storeUpdate},shopConfig:{findUnique:vi.fn().mockResolvedValue(null),upsert:configUpdate}}));
 expect(await m.save!({values,expectedStoreId:'test',expectedRevision:'old'})).toMatchObject({success:false});expect(storeUpdate).not.toHaveBeenCalled();expect(configUpdate).not.toHaveBeenCalled();
});

it('saves only the Beauty personnel preference and rejects unsupported choices and stale changes',async()=>{
 const upsert=vi.fn(),raw=vi.fn();let label:string|null=null;
 m.transaction.mockImplementation(async work=>work({$queryRaw:raw,shopConfig:{findUnique:async()=>({coursePersonnelLabel:label,bankName:'保留銀行'}),upsert}}));
 const revision=()=>courseSettingsSectionRevision({section:'personnel',personnelLabel:label==='老師'?'老師':null});
 const save=(personnelLabel:string|null,expectedRevision=revision())=>m.save!({values:{section:'personnel',personnelLabel},expectedStoreId:'test',expectedRevision});
 expect(await save('教練')).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 expect(await save('老師')).toMatchObject({success:true,data:{values:{section:'personnel',personnelLabel:'老師'}}});
 expect(upsert.mock.calls[0][0]).toMatchObject({where:{storeId:'test'},update:{coursePersonnelLabel:'老師'}});
 expect(Object.keys(upsert.mock.calls[0][0].update)).toEqual(['coursePersonnelLabel']);
 const old=revision();label='老師';upsert.mockClear();
 expect(await save(null,old)).toMatchObject({success:false});expect(upsert).not.toHaveBeenCalled();
 expect(await save('老師',old)).toMatchObject({success:true});expect(upsert).not.toHaveBeenCalled();
 expect(await save(null)).toMatchObject({success:true,data:{values:{personnelLabel:null}}});
});
it('blocks personnel changes after a store switch or revoked permission',async()=>{
 expect(await m.save!({values:{section:'personnel',personnelLabel:'老師'},expectedStoreId:'other'})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.actor.mockRejectedValueOnce(new Error('revoked'));expect(await m.save!({values:{section:'personnel',personnelLabel:'老師'},expectedStoreId:'test'})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
