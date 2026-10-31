/** Real, disposable loopback database only. No hosted data or notification worker. */
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {PrismaClient as CourseClient,type Prisma as CoursePrisma} from '../../generated/course-client';
import {PrismaClient as BeautyClient,type Prisma as BeautyPrisma} from '../../generated/beauty-client';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
import {adjustCourseSessions} from '@/server/services/course-session-adjustment';
import {adjustBeautySessions} from '@/server/beauty/session-adjustment';
import {courseSessionAdjustmentRecords} from '@/server/services/course-session-adjustment-records';
import {beautySessionAdjustmentRecords} from '@/server/beauty/session-adjustment';
import {bindMusicLesson} from '@/server/services/music-lesson-periods';
import {activeSessionAdjustments,sessionAdjustmentInput} from '@/lib/plan-session-adjustment';
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:()=>true}));
const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env),schema='session_adjustment_'+randomUUID().replaceAll('-','');
const url=databaseUrl?new URL(databaseUrl):null;url?.searchParams.set('schema',schema);url?.searchParams.set('connection_limit','8');
const course=url?new CourseClient({datasourceUrl:url.toString()}):null,beauty=url?new BeautyClient({datasourceUrl:url.toString()}):null;
const actor=(storeId:string)=>({storeId,userId:'manager',name:'Synthetic manager',role:'OWNER',manager:true});
async function courseTx<T>(storeId:string,work:(tx:CoursePrisma.TransactionClient)=>Promise<T>){return course!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;return work(tx);},{timeout:20000});}
async function beautyTx<T>(work:(tx:BeautyPrisma.TransactionClient)=>Promise<T>){return beauty!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);await tx.$queryRaw`SELECT id FROM "Store" WHERE id='beauty' FOR UPDATE`;return work(tx);},{timeout:20000});}
(databaseUrl?describe:describe.skip)('session adjustments real PostgreSQL',()=>{
  beforeAll(async()=>{
    await course!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const model of ['course-prisma/schema.prisma','beauty-prisma/schema.prisma']){
      const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel',model,'--script'],{encoding:'utf8'});
      await course!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);for(const sql of ddl.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(sql);});
    }
    await course!.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);
      for(const sql of [
        `CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text,"operatingStatus" text)`,
        `INSERT INTO "Store" VALUES('sports','COURSE','ACTIVE'),('music','COURSE','ACTIVE'),('beauty','BEAUTY','ACTIVE')`,
        `CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)`,
        `INSERT INTO "StoreFeatureEntitlement" VALUES('music','business.music','ENABLED')`,
        `CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"actorRoleSnapshot" text,"storeId" text,module text,source text,"targetType" text,"targetId" text,action text,summary text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)`,
        `CREATE TABLE "CourseMusicLessonAssignment"("bookingId" text PRIMARY KEY,"storeId" text,"cardId" text,"customerId" text,period int,ordinal int,kind text,"sourceBookingId" text,"releasedAt" timestamptz,"updatedAt" timestamptz DEFAULT now())`,
      ])await tx.$executeRawUnsafe(sql);
      const check=readFileSync('prisma/migrations/20261003105340_course_companion_booking/migration.sql','utf8').match(/ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK \([\s\S]*?\n\);/)?.[0];
      if(!check)throw Error('Ledger constraint missing');await tx.$executeRawUnsafe(check);
    });
  },60000);
  afterAll(async()=>{try{await course!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await course!.$disconnect();await beauty!.$disconnect();}});
  async function fixture(module:'sports'|'music'|'beauty'){
    const expiresAt=new Date('2027-12-31T15:59:59.999Z');
    const card=module==='beauty'?await beautyTx(async tx=>{
      const c=await tx.beautyCard.create({data:{storeId:module,customerId:'learner',memberIds:['learner'],planId:'plan',name:'Synthetic paid plan',sessions:10,remaining:10,listPrice:5000,paid:5000,serviceIds:[],allowShared:false,expiresAt}});
      await tx.beautyPayment.create({data:{storeId:module,cardId:c.id,kind:'SALE',amount:5000,method:'CASH',note:'Original synthetic receipt',actorUserId:'manager'}});return c;
    }):await courseTx(module,async tx=>{
      const plan=await tx.coursePointPlan.create({data:{storeId:module,name:randomUUID(),points:10,price:5000,validDays:365,unit:'SESSION'}});
      const c=await tx.coursePointCard.create({data:{storeId:module,planId:plan.id,nameSnapshot:'Synthetic paid card',unit:'SESSION',remaining:10,expiresAt,requestKey:randomUUID(),musicTermSizes:module==='music'?[5,5]:[],members:{create:{customerId:'learner'}}}});
      await tx.coursePointEntry.create({data:{storeId:module,cardId:c.id,kind:'GRANT',points:10,actorUserId:'manager'}});
      await tx.coursePurchase.create({data:{storeId:module,cardId:c.id,planId:plan.id,customerId:'learner',name:'Original synthetic receipt',unit:'SESSION',points:10,price:5000,validDays:365,status:'CONFIRMED',transferLastFive:'',requestKey:randomUUID()}});return c;
    });
    return {card,d:sessionAdjustmentInput.parse({expectedStoreId:module,requestKey:randomUUID(),cardId:card.id,customerId:'learner',operation:'BACKFILL',quantity:2,expectedRemaining:10,expectedExpiresAt:expiresAt.toISOString(),occurredOn:'2026-01-02'})};
  }
  const run=(module:string,d:ReturnType<typeof sessionAdjustmentInput.parse>)=>module==='beauty'?beautyTx(tx=>adjustBeautySessions(tx,actor(module),d,'Synthetic learner')):courseTx(module,tx=>adjustCourseSessions(tx,actor(module),d,'Synthetic learner'));
  const balance=(module:string,id:string)=>module==='beauty'?beautyTx(tx=>tx.beautyCard.findUniqueOrThrow({where:{id}})):courseTx(module,tx=>tx.coursePointCard.findUniqueOrThrow({where:{id}}));
  const history=(module:string,id:string)=>module==='beauty'?beautyTx(tx=>beautySessionAdjustmentRecords(tx,module,[id])):courseTx(module,tx=>courseSessionAdjustmentRecords(tx,module,[id]));
  for(const moduleName of ['sports','music','beauty'] as const){
    it(`${moduleName}: durable retry, single correction and original money/history preserved`,async()=>{
      const {card,d}=await fixture(moduleName),first=await run(moduleName,d);
      expect(first.remaining).toBe(8);expect(first.record.occurredOn).toBe('2026-01-02');
      expect(await run(moduleName,d)).toEqual(first);expect(await history(moduleName,card.id)).toHaveLength(1);
      await expect(run(moduleName,{...d,quantity:3})).rejects.toThrow('已使用');
      const correction={...d,requestKey:randomUUID(),operation:'REVERSE' as const,reversalOf:first.record.id,expectedRemaining:8};
      expect((await run(moduleName,correction)).remaining).toBe(10);
      expect(await run(moduleName,correction)).toMatchObject({remaining:10});
      await expect(run(moduleName,{...correction,requestKey:randomUUID(),expectedRemaining:10})).rejects.toThrow('已更正');
      expect(await history(moduleName,card.id)).toHaveLength(2);expect(activeSessionAdjustments(await history(moduleName,card.id))).toHaveLength(0);
      if(moduleName==='beauty')expect(await beautyTx(tx=>tx.beautyPayment.findFirstOrThrow({where:{cardId:card.id}}))).toMatchObject({kind:'SALE',amount:5000});
      else expect(await courseTx(moduleName,tx=>tx.coursePurchase.findFirstOrThrow({where:{cardId:card.id}}))).toMatchObject({status:'CONFIRMED',price:5000});
    });
    it(`${moduleName}: concurrent same command debits once; different stale commands cannot both debit`,async()=>{
      const one=await fixture(moduleName);const same=await Promise.all([run(moduleName,one.d),run(moduleName,one.d)]);expect(same[0]).toEqual(same[1]);expect((await balance(moduleName,one.card.id)).remaining).toBe(8);expect(await history(moduleName,one.card.id)).toHaveLength(1);
      const two=await fixture(moduleName);const different=await Promise.allSettled([run(moduleName,two.d),run(moduleName,{...two.d,requestKey:randomUUID()})]);expect(different.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await balance(moduleName,two.card.id)).remaining).toBe(8);
    });
    it(`${moduleName}: a failed transaction rolls quota, ledger and receipt back together`,async()=>{
      const {card,d}=await fixture(moduleName);
      const work=async(tx:never)=>{if(moduleName==='beauty')await adjustBeautySessions(tx,actor(moduleName),d,'Synthetic learner');else await adjustCourseSessions(tx,actor(moduleName),d,'Synthetic learner');throw Error('Injected rollback');};
      await expect(moduleName==='beauty'?beautyTx(tx=>work(tx as never)):courseTx(moduleName,tx=>work(tx as never))).rejects.toThrow('Injected rollback');
      expect((await balance(moduleName,card.id)).remaining).toBe(10);expect(await history(moduleName,card.id)).toHaveLength(0);
    });
  }
  it('music: backfilled and voided period slots cannot be allocated again; correction releases them',async()=>{
    const {card,d}=await fixture('music');const first=await run('music',{...d,operation:'VOID'});
    expect(first.record.slots?.map(s=>[s.period,s.ordinal])).toEqual([[1,1],[1,2]]);
    const booking=await courseTx('music',async tx=>{
      const room=await tx.courseRoom.create({data:{storeId:'music',name:randomUUID()}}),template=await tx.courseTemplate.create({data:{storeId:'music',name:randomUUID(),durationMinutes:60,pointCost:1,capacity:3}});
      const s=await tx.courseSession.create({data:{storeId:'music',roomId:room.id,templateId:template.id,coachId:'coach',nameSnapshot:'Synthetic class',startsAt:new Date('2026-11-01T01:00Z'),endsAt:new Date('2026-11-01T02:00Z'),pointCost:1,capacity:3,requestKey:randomUUID(),requestIndex:0,createdById:'manager'}});
      const b=await tx.courseBooking.create({data:{storeId:'music',sessionId:s.id,cardId:card.id,customerId:'learner',operatorUserId:'manager',operatorName:'Manager',customerName:'Learner',pointCost:1,requestKey:randomUUID()}});
      const nativeCard=await tx.coursePointCard.findUniqueOrThrow({where:{id:card.id}});
      await bindMusicLesson(tx,'music',b,nativeCard);return b;
    });
    const slots=await courseTx('music',tx=>tx.$queryRaw<Array<{ordinal:number}>>`SELECT ordinal FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${booking.id}`);expect(slots[0].ordinal).toBe(3);
    await run('music',{...d,requestKey:randomUUID(),operation:'REVERSE',reversalOf:first.record.id,expectedRemaining:8});
    const revised=await run('music',{...d,requestKey:randomUUID(),operation:'VOID',expectedRemaining:10,quantity:1});expect(revised.record.slots?.[0]).toMatchObject({period:1,ordinal:1});
  });
  it('music: actual historical first-use controls expiry, and reversing the only backfill restores unactivated state',async()=>{
    const {card,d}=await fixture('music');
    const unactivated=new Date('2099-12-31T15:59:59.999Z');
    await courseTx('music',tx=>tx.coursePointCard.update({where:{id:card.id},data:{musicValidityDays:35,expiresAt:unactivated}}));
    const first=await run('music',{...d,expectedExpiresAt:unactivated.toISOString()});
    expect(first.expiresAt).toBe('2026-02-05T15:59:59.999Z');
    expect(await balance('music',card.id)).toMatchObject({remaining:8,musicActivatedAt:new Date('2026-01-01T16:00:00Z')});
    const result=await run('music',{...d,requestKey:randomUUID(),operation:'REVERSE',reversalOf:first.record.id,expectedRemaining:8,expectedExpiresAt:first.expiresAt});
    expect(result.expiresAt).toBe(unactivated.toISOString());expect(await balance('music',card.id)).toMatchObject({remaining:10,musicActivatedAt:null,closedAt:null});
    expect(await courseTx('music',tx=>tx.coursePointCard.count({where:{requestKey:{startsWith:'music-leave-makeup:'}}}))).toBe(0);
  });
});
