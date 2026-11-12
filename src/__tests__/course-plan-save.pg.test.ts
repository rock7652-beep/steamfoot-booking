import {beforeAll,afterAll,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),transaction:vi.fn(),roomUse:vi.fn(),duration:vi.fn(),revalidate:vi.fn(),music:vi.fn(),term:vi.fn()}));
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate,unstable_cache:(fn:unknown)=>fn}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access,courseTransaction:m.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseTemplate:{count:async()=>0}}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock("@/server/services/course-resources",()=>({assertNoCourseResourceUse:m.roomUse,handleCourseActionError:(error:Error)=>({success:false,error:error.message})}));
vi.mock("@/server/services/course-availability",()=>({assertMusicCourseDuration:m.duration}));
vi.mock("@/server/services/course-coach-notification-kick",()=>({kickCoachNotifications:vi.fn()}));
vi.mock("@/server/services/course-term",()=>({validateCourseTerm:m.term}));
vi.mock("@/server/services/course-shared-card",()=>({getCourseSharedCardStateInTransaction:async()=>"ENABLED"}));
vi.mock("@/server/services/course-booking",()=>({}));
vi.mock("@/server/services/course-waitlist",()=>({}));
vi.mock("@/server/services/course-display-order",()=>({}));
vi.mock("@/server/services/music-subject-rule",()=>({}));
vi.mock("@/server/services/course-low-balance-schedule",()=>({}));
vi.mock("@/server/services/course-assignment-checkout",()=>({}));
vi.mock("@/server/services/operation-audit-outbox",()=>({}));

import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import {PrismaClient} from '../../generated/course-client';
import {saveCoursePointPlan} from '@/server/actions/course-members';
import {coursePlanSnapshot} from '@/lib/course-plan-snapshot';
import {coursePlanValues} from '@/lib/course-plan-save';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
import {sportsTeachingTemplateId} from '@/server/services/sports-teaching-rule';
// Turbopack's bundled imports and the external native Prisma loader can load
// separate runtime instances. Real PostgreSQL must see the right SQL-null enum.
vi.mock('../../generated/course-client',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../generated/course-client')>();
 const {createRequire}=await import('node:module');
 const {mkdtempSync,copyFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const nativeRequire=createRequire(import.meta.url);
 const directory=mkdtempSync(join(tmpdir(),'fee-prisma-runtime-'));
 const runtimePath=join(directory,'library.cjs');
 copyFileSync(nativeRequire.resolve('@prisma/client/runtime/library'),runtimePath);
 const runtime=nativeRequire(runtimePath);
 rmSync(directory,{recursive:true,force:true});
 return {...actual,Prisma:{...actual.Prisma,DbNull:runtime.objectEnumValues.instances.DbNull}};
});
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStore:async()=>false}));
vi.mock('@/lib/sports-staging',()=>({requireSportsStaging:async()=>({storeId:'store'})}));
vi.mock('@/server/services/sports-production-readiness',()=>({assertSportsProductionReady:async()=>{}}));
const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schemaName='fee_revision_'+randomUUID().replaceAll('-','');
const scopedUrl=databaseUrl?new URL(databaseUrl):null;
scopedUrl?.searchParams.set('schema',schemaName);
const db=scopedUrl?new PrismaClient({datasourceUrl:scopedUrl.toString()}):null;
const database=()=>{if(!db)throw Error('Explicit test database required');return db;};
(databaseUrl?describe:describe.skip)('fee purchase mode saves through real Prisma and PostgreSQL',()=>{
 let created=false;
 beforeAll(async()=>{
  await database().$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);created=true;
  const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script'],{encoding:'utf8'});
  for(const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean))await database().$executeRawUnsafe(statement);
  await database().courseTemplate.create({data:{id:'template',storeId:'store',name:'Synthetic dance',durationMinutes:90,pointCost:1,capacity:8}});
  await database().musicSubject.create({data:{id:'subject',storeId:'store',name:'Synthetic teaching item'}});
  await database().musicSubject.create({data:{id:'subject-B',storeId:'store',name:'Synthetic B'}});
  await database().musicSubject.create({data:{id:'foreign',storeId:'other',name:'Foreign'}});
  await database().musicSubject.create({data:{id:'inactive',storeId:'store',name:'Inactive',isActive:false}});
  await database().courseTemplate.create({data:{id:sportsTeachingTemplateId('store','subject-B'),storeId:'store',musicSubjectId:'subject-B',name:'Synthetic B',durationMinutes:60,pointCost:1,capacity:8}});
  await database().courseTemplate.create({data:{id:sportsTeachingTemplateId('store','subject'),storeId:'store',musicSubjectId:'subject',name:'Synthetic assigned dance',durationMinutes:90,pointCost:1,capacity:8}});
 },30000);
 afterAll(async()=>{if(created)await database().$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);await db?.$disconnect();});
 beforeEach(()=>{
  vi.clearAllMocks();m.access.mockResolvedValue({storeId:'store',user:{id:'manager',role:'OWNER'}});
  m.transaction.mockImplementation(async(_store,work)=>database().$transaction(work));m.term.mockResolvedValue([]);
  m.music.mockResolvedValue({storeId:'store'});
 });
 async function fixture(sportsMode:'LEGACY'|'ASSIGNED'|'SUBJECTS'='LEGACY'){
  return database().coursePointPlan.create({data:{storeId:'store',name:randomUUID(),points:10,price:5800,storeCost:0,validDays:90,unit:'SESSION',templateIds:[sportsMode==='LEGACY'?'template':sportsTeachingTemplateId('store','subject')],customerPurchasable:true,sportsMode,sportsSubjectId:sportsMode==='ASSIGNED'?'subject':null,sportsCost:sportsMode==='ASSIGNED'?1:null}});
 }
 function edit(plan:Awaited<ReturnType<typeof fixture>>,customerPurchasable:boolean){
  return {...coursePlanValues.parse(plan),customerPurchasable,expectedSnapshot:JSON.stringify(coursePlanSnapshot(plan)),receipt:{expectedStoreId:'store',requestKey:randomUUID()}};
 }
 it('reports a real inactive-name collision without losing store identity or changing the old plan',async()=>{
  const seed=await fixture();
  const plan=await database().coursePointPlan.update({where:{id:seed.id},data:{isActive:false}});
  const values=coursePlanValues.omit({id:true}).parse(plan);
  const result=await saveCoursePointPlan({...values,isActive:true,price:800,points:1,receipt:{expectedStoreId:'store',requestKey:randomUUID()}});
  expect(result).toEqual({success:false,error:'已有同名收費方式（含下架），請編輯原方案或更換名稱。',uncertain:false});
  expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}})).toEqual(plan);
  expect(await database().coursePointPlan.count({where:{storeId:'store',name:plan.name}})).toBe(1);
 });
 it.each(['LEGACY','ASSIGNED'] as const)('saves SQL-null %s plans in both directions with confirmed snapshots',async sportsMode=>{
  let plan=await fixture(sportsMode);
  for(const customerPurchasable of [false,true,false]){
   const name='Renamed dance '+randomUUID();
   const result=await saveCoursePointPlan({...edit(plan,customerPurchasable),name});
   expect(result,JSON.stringify(result)).toMatchObject({success:true,data:{id:plan.id,name,customerPurchasable,price:5800,points:10,validDays:90,templateIds:plan.templateIds}});
   plan=await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}});
   expect(plan.name).toBe(name);
   expect(plan.customerPurchasable).toBe(customerPurchasable);
   expect(plan.chargeSettings).toBeNull();
  }
 });
 it('confirms an applied edit after a lost reply without treating its original snapshot as a new conflict',async()=>{
  const plan=await fixture(),input=edit(plan,false);
  const saved=await saveCoursePointPlan(input);
  expect(saved.success).toBe(true);
  expect(await saveCoursePointPlan(input)).toEqual(saved);
 });
 it('returns catalog metadata with the confirmed plan in the same transaction',async()=>{
  const plan=await fixture();
  const result=await saveCoursePointPlan(edit(plan,false));
  expect(result).toMatchObject({success:true,data:{id:plan.id,catalogTemplates:[{id:'template',name:expect.any(String),durationMinutes:expect.any(Number)}]}});
  if(result.success)expect(result.data?.catalogTemplates?.map(row=>row.id)).toEqual(plan.templateIds);
 });
 it('still rejects genuine concurrent changes without overwriting price or purchase visibility',async()=>{
  const plan=await fixture(),input=edit(plan,false);
  await database().coursePointPlan.update({where:{id:plan.id},data:{price:6100}});
  expect(await saveCoursePointPlan(input)).toMatchObject({success:false,error:'方案已有更新，輸入已保留。請核對目前資料後再編輯。'});
  expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}})).toMatchObject({price:6100,customerPurchasable:true});
 });
 it('still rejects a mismatched store receipt before attempting a transaction',async()=>{
  const plan=await fixture(),input=edit(plan,false);
  expect(await saveCoursePointPlan({...input,receipt:{...input.receipt,expectedStoreId:'other'}})).toMatchObject({success:false});
  expect(m.transaction).not.toHaveBeenCalled();
  expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}})).toMatchObject({customerPurchasable:true});
 });
 it('reproduces the null mismatch with a bundled import and a native external client',async()=>{
  const plan=await fixture(),directory=mkdtempSync(join(tmpdir(),'fee-prisma-bundle-'));
  const outfile=join(directory,'probe.cjs');
  try{
   buildSync({stdin:{resolveDir:process.cwd(),contents:`
    import {Prisma as BundledPrisma} from './generated/course-client';
    import {createRequire} from 'node:module';
    const nativeRequire=createRequire(process.cwd()+'/package.json');
    const {PrismaClient,Prisma:NativePrisma}=nativeRequire('./generated/course-client');
    const db=new PrismaClient({datasourceUrl:process.env.FEE_TEST_DATABASE_URL});
    (async()=>{try{
     const bundled=await db.coursePointPlan.count({where:{id:process.env.FEE_TEST_PLAN_ID,chargeSettings:{equals:BundledPrisma.DbNull}}});
     const native=await db.coursePointPlan.count({where:{id:process.env.FEE_TEST_PLAN_ID,chargeSettings:{equals:NativePrisma.DbNull}}});
     console.log(JSON.stringify({bundled,native}));
    }finally{await db.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1});
   `},bundle:true,platform:'node',format:'cjs',outfile});
   const output=execFileSync(process.execPath,[outfile],{encoding:'utf8',env:{...process.env,FEE_TEST_DATABASE_URL:scopedUrl!.toString(),FEE_TEST_PLAN_ID:plan.id}});
   expect(JSON.parse(output)).toEqual({bundled:0,native:1});
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
 it('saves explicit multiple subjects through the real action and replays the same snapshot after a lost reply',async()=>{
  const plan=await fixture('ASSIGNED');
  const input={...edit(plan,false),sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:['subject','subject-B']};
  const saved=await saveCoursePointPlan(input);
  expect(saved,JSON.stringify(saved)).toMatchObject({success:true,data:{sportsMode:'SUBJECTS',sportsSubjectIds:['subject','subject-B'],sportsSubjectId:null,sportsCost:1,templateIds:['subject','subject-B'].map(id=>sportsTeachingTemplateId('store',id))}});
  expect(await saveCoursePointPlan(input)).toEqual(saved);
  const current=await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}});
  expect(await saveCoursePointPlan({...edit(current,true),name:'Updated multi '+randomUUID()})).toMatchObject({success:true,data:{sportsSubjectIds:['subject','subject-B'],customerPurchasable:true}});
 });
 it('rejects foreign, inactive, empty and duplicate subject scopes with no partial plan update',async()=>{
  const plan=await fixture('ASSIGNED');
  for(const scopes of [['subject','foreign'],['subject','inactive'],[],['subject','subject']]){
   expect(await saveCoursePointPlan({...edit(plan,false),sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:scopes})).toMatchObject({success:false});
   expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}})).toEqual(plan);
  }
 });
 it('rejects stale multi-subject edits without overwriting a newer scope',async()=>{
  let plan=await fixture('ASSIGNED');
  plan=await database().coursePointPlan.update({where:{id:plan.id},data:{sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:['subject','subject-B']}});
  const stale=edit(plan,false);
  await database().coursePointPlan.update({where:{id:plan.id},data:{sportsMode:'ASSIGNED',sportsSubjectId:'subject',sportsSubjectIds:[]}});
  expect(await saveCoursePointPlan(stale)).toMatchObject({success:false,error:'方案已有更新，輸入已保留。請核對目前資料後再編輯。'});
  expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:plan.id}})).toMatchObject({sportsMode:'ASSIGNED',sportsSubjectId:'subject',sportsSubjectIds:[],customerPurchasable:true});
 });

});
