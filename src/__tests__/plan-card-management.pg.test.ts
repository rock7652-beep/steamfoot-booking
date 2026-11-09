/** Disposable loopback PostgreSQL only. Exercises actual transactions, ledger
 * constraints, retry receipts and concurrent requests; no delivery worker. */
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {PrismaClient as CourseClient,type Prisma as CoursePrisma} from '../../generated/course-client';
import {PrismaClient,type Prisma} from '@prisma/client';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
import {manageCourseCard} from '@/server/services/course-card-management';
import {closeSteamWallet} from '@/server/services/steam-wallet-management';
import {lockCourseStore} from '@/server/services/course-store-lock';
import {allocateSessionsFefo} from '@/server/services/wallet-session';
import {planManagementInput} from '@/lib/plan-management';

const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env),schema='plan_management_'+randomUUID().replaceAll('-','');
const url=databaseUrl?new URL(databaseUrl):null;url?.searchParams.set('schema',schema);url?.searchParams.set('connection_limit','6');
const course=url?new CourseClient({datasourceUrl:url.toString()}):null,main=url?new PrismaClient({datasourceUrl:url.toString()}):null;
const actor={storeId:'store',userId:'manager',name:'Synthetic manager'};
const courseTx=<T>(work:(tx:CoursePrisma.TransactionClient)=>Promise<T>)=>course!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);await lockCourseStore(tx,'store');return work(tx);},{timeout:20000});
const mainTx=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>main!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path="${schema}"`);return work(tx);},{timeout:20000});
const describeDatabase=databaseUrl?describe:describe.skip;
describeDatabase('plan management actual PostgreSQL',()=>{
 beforeAll(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T01:00:00Z'));
  await course!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script'],{encoding:'utf8'});
  await mainTx(async tx=>{await tx.$executeRawUnsafe(`CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text,"operatingStatus" text)`);await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES('store','COURSE','ACTIVE')`);});
  await courseTx(async tx=>{
   // Prisma-generated table DDL has no procedural or dollar-quoted statements.
   for(const sql of ddl.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(sql);
  });
  await mainTx(async tx=>{
   for(const sql of [
    `CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)`,
    `CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text CHECK("actorUserId"<>'reject-audit'),"actorNameSnapshot" text,"actorRoleSnapshot" text,"loginRecordId" text,"storeId" text,module text,source text,"targetType" text,"targetId" text,action text,summary text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)`,
    `CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE','EXPIRED','USED_UP','CANCELLED')`,
    `CREATE TYPE "WalletSessionStatus" AS ENUM ('AVAILABLE','RESERVED','COMPLETED','VOIDED')`,
    `CREATE TYPE "BookingStatus" AS ENUM ('PENDING','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')`,
    `CREATE TABLE "CustomerPlanWallet"(id text PRIMARY KEY,"customerId" text,"storeId" text,"planId" text,"purchasedPrice" numeric,"totalSessions" int,"remainingSessions" int,"startDate" date,"expiryDate" date,status "WalletStatus","createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now())`,
    `CREATE TABLE "WalletSession"(id text PRIMARY KEY,"walletId" text,"sessionNo" int,status "WalletSessionStatus","bookingId" text,"reservedAt" timestamp,"completedAt" timestamp,"voidedAt" timestamp,"voidReason" text,"voidedByStaffId" text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now())`,
    `CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerPlanWalletId" text,"isMakeup" boolean DEFAULT false,"bookingStatus" "BookingStatus","bookingDate" date)`,
   ])await tx.$executeRawUnsafe(sql);
   const migration=readFileSync('prisma/migrations/20261003105340_course_companion_booking/migration.sql','utf8');
   const check=migration.match(/ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK \([\s\S]*?\n\);/)?.[0];
   if(!check)throw Error('Reviewed ledger constraint missing');await tx.$executeRawUnsafe(check);
  });
 },40000);
 afterAll(async()=>{vi.useRealTimers();try{await course!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await course!.$disconnect();await main!.$disconnect();}});
 async function fixture(){return courseTx(async tx=>{
  const plan=await tx.coursePointPlan.create({data:{storeId:'store',name:randomUUID(),points:10,price:5000,validDays:365,unit:'SESSION'}});
  const card=await tx.coursePointCard.create({data:{storeId:'store',planId:plan.id,nameSnapshot:'Synthetic paid card',unit:'SESSION',remaining:10,expiresAt:new Date('2027-04-22T15:59:59.999Z'),createdAt:new Date('2026-10-01T01:00Z'),requestKey:randomUUID(),musicValidityDays:35,musicActivatedAt:null}});
  await tx.coursePointEntry.create({data:{storeId:'store',cardId:card.id,kind:'GRANT',points:10,actorUserId:'manager'}});
  await tx.coursePurchase.create({data:{storeId:'store',cardId:card.id,planId:plan.id,customerId:'customer',name:'Original paid purchase',unit:'SESSION',points:10,price:5000,validDays:365,templateIds:[],status:'CONFIRMED',transferLastFive:'',requestKey:randomUUID()}});
  const input=planManagementInput.parse({expectedStoreId:'store',requestKey:randomUUID(),cardId:card.id,operation:'close',expectedRemaining:10,expectedExpiresAt:card.expiresAt!.toISOString(),reason:'Synthetic confirmed adjustment'});
  return {card,input};
 });}
 async function reserve(tx:CoursePrisma.TransactionClient,cardId:string){
  const card=await tx.coursePointCard.findUniqueOrThrow({where:{id:cardId}});if(card.closedAt)throw Error('closed card cannot reserve');
  const room=await tx.courseRoom.create({data:{storeId:'store',name:randomUUID()}}),template=await tx.courseTemplate.create({data:{storeId:'store',name:randomUUID(),durationMinutes:60,pointCost:1,capacity:3}});
  const session=await tx.courseSession.create({data:{storeId:'store',roomId:room.id,templateId:template.id,coachId:'coach',nameSnapshot:'Synthetic future lesson',startsAt:new Date('2027-03-01T01:00Z'),endsAt:new Date('2027-03-01T02:00Z'),pointCost:1,capacity:3,requestKey:randomUUID(),requestIndex:0,createdById:'manager'}});
  return tx.courseBooking.create({data:{storeId:'store',sessionId:session.id,cardId,customerId:'customer',operatorUserId:'manager',operatorName:'Synthetic manager',customerName:'Synthetic customer',pointCost:1,requestKey:randomUUID()}});
 }
 it('closes quota, retains the original purchase and creates one retryable audit',async()=>{
  const {card,input}=await fixture();const first=await courseTx(tx=>manageCourseCard(tx,actor,input));
  expect(await courseTx(tx=>manageCourseCard(tx,actor,input))).toEqual(first);
  await courseTx(async tx=>{expect((await tx.coursePointEntry.findMany({where:{cardId:card.id,kind:'VOID'}}))).toHaveLength(1);expect(await tx.coursePurchase.findFirst({where:{cardId:card.id}})).toMatchObject({status:'CONFIRMED',price:5000});expect(await tx.$queryRaw`SELECT action FROM "AuditLog" WHERE "targetId"=${card.id}`).toHaveLength(1);});
  await expect(courseTx(tx=>manageCourseCard(tx,actor,{...input,reason:'Different payload'}))).rejects.toThrow('識別碼');
 });
 it.each(['2027-02-01','2027-08-01'])('adjusts finite expiry to %s without changing money, points or period metadata',async expiresDate=>{
  const {card,input}=await fixture();await courseTx(tx=>manageCourseCard(tx,actor,{...input,operation:'expiry',expiresDate}));
  await courseTx(async tx=>{expect(await tx.coursePointCard.findUnique({where:{id:card.id}})).toMatchObject({remaining:10,closedAt:null,musicValidityDays:null,musicActivatedAt:null,expiresAt:new Date(expiresDate+'T15:59:59.999Z')});expect(await tx.coursePointEntry.count({where:{cardId:card.id}})).toBe(1);expect(await tx.coursePurchase.findFirst({where:{cardId:card.id}})).toMatchObject({status:'CONFIRMED',price:5000});});
 });
 it('blocks closing or shortening across a reservation and rejects stale versions',async()=>{
  const {card,input}=await fixture();await courseTx(tx=>reserve(tx,card.id));
  await expect(courseTx(tx=>manageCourseCard(tx,actor,input))).rejects.toThrow('預約占用');
  await expect(courseTx(tx=>manageCourseCard(tx,actor,{...input,operation:'expiry',expiresDate:'2027-02-01'}))).rejects.toThrow('既有預約');
  await expect(courseTx(tx=>manageCourseCard(tx,actor,{...input,expectedRemaining:9}))).rejects.toThrow('已更新');
  expect(await courseTx(tx=>tx.coursePointCard.findUnique({where:{id:card.id}}))).toMatchObject({remaining:10,closedAt:null});
 });
 it('serializes concurrent same-key closes without duplicate ledger or audit',async()=>{
  const {card,input}=await fixture();const results=await Promise.all([courseTx(tx=>manageCourseCard(tx,actor,input)),courseTx(tx=>manageCourseCard(tx,actor,input))]);expect(results[0]).toEqual(results[1]);
  expect(await courseTx(tx=>tx.coursePointEntry.count({where:{cardId:card.id,kind:'VOID'}}))).toBe(1);
 });
 it('rejects the losing manager update and never allows both close and reserve',async()=>{
  const one=await fixture();const dates=await Promise.allSettled(['2027-05-01','2027-06-01'].map(expiresDate=>courseTx(tx=>manageCourseCard(tx,actor,{...one.input,requestKey:randomUUID(),operation:'expiry',expiresDate}))));expect(dates.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const two=await fixture();const race=await Promise.allSettled([courseTx(tx=>manageCourseCard(tx,actor,two.input)),courseTx(tx=>reserve(tx,two.card.id))]);expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 });
 it('rolls quota and ledger back if the immutable audit cannot be persisted',async()=>{
  const {card,input}=await fixture();await expect(courseTx(tx=>manageCourseCard(tx,{...actor,userId:'reject-audit'},input))).rejects.toThrow();
  expect(await courseTx(tx=>tx.coursePointCard.findUnique({where:{id:card.id}}))).toMatchObject({remaining:10,closedAt:null});
  expect(await courseTx(tx=>tx.coursePointEntry.count({where:{cardId:card.id}}))).toBe(1);
 });
 async function steamFixture(){const id=randomUUID();await mainTx(async tx=>{
  await tx.$executeRaw`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId","planId","purchasedPrice","totalSessions","remainingSessions","startDate","expiryDate",status) VALUES (${id},'store','customer','plan',5000,5,3,'2026-10-01','2027-04-22','ACTIVE')`;
  for(let i=1;i<=5;i++)await tx.$executeRaw`INSERT INTO "WalletSession" (id,"walletId","sessionNo",status) VALUES (${id+':'+i},${id},${i},${i<=2?'COMPLETED':'AVAILABLE'}::"WalletSessionStatus")`;
 });return {id,input:planManagementInput.parse({expectedStoreId:'store',requestKey:randomUUID(),cardId:id,operation:'close',expectedRemaining:3,expectedExpiresAt:'2027-04-22T00:00:00.000Z',reason:'Synthetic close'})};}
 it('closes a partially used steam wallet while keeping used sessions and original price',async()=>{
  const {id,input}=await steamFixture();const result=await mainTx(tx=>closeSteamWallet(tx,actor,input,null));expect(result).toMatchObject({remaining:0,closed:true});expect(await mainTx(tx=>closeSteamWallet(tx,actor,input,null))).toEqual(result);
  expect(await mainTx(tx=>tx.customerPlanWallet.findUnique({where:{id}}))).toMatchObject({status:'CANCELLED',remainingSessions:0,purchasedPrice:expect.anything(),totalSessions:5});
  expect(await mainTx(tx=>tx.walletSession.count({where:{walletId:id,status:'COMPLETED'}}))).toBe(2);expect(await mainTx(tx=>tx.walletSession.count({where:{walletId:id,status:'VOIDED'}}))).toBe(3);
 });
 it('blocks steam reserved quota and mismatched counters',async()=>{
  const {id,input}=await steamFixture();await mainTx(tx=>tx.walletSession.updateMany({where:{id:id+':3'},data:{status:'RESERVED'}}));
  await expect(mainTx(tx=>closeSteamWallet(tx,actor,input,null))).rejects.toThrow('預約占用');
  await mainTx(tx=>tx.walletSession.updateMany({where:{id:id+':3'},data:{status:'VOIDED'}}));await expect(mainTx(tx=>closeSteamWallet(tx,actor,input,null))).rejects.toThrow('不一致');
 });
 it('steam reservation races cannot consume a session after it is voided',async()=>{
  const {id,input}=await steamFixture();const results=await Promise.allSettled([mainTx(tx=>closeSteamWallet(tx,actor,input,null)),mainTx(tx=>allocateSessionsFefo(tx,{candidates:[{id,expiryDate:new Date('2027-04-22'),createdAt:new Date('2026-10-01'),remainingSessions:3}],bookingId:randomUUID(),count:1}))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const wallet=await mainTx(tx=>tx.customerPlanWallet.findUniqueOrThrow({where:{id}}));const held=await mainTx(tx=>tx.walletSession.count({where:{walletId:id,status:'RESERVED'}}));expect(wallet.status==='CANCELLED'?held===0:held===1).toBe(true);
 });
});
