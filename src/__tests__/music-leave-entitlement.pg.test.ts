/** Disposable loopback PostgreSQL only. Synthetic purchase → deferred leave →
 * manual expiry → makeup reservation, using real service transactions and SQL.
 * Action identity/Next side effects are stubbed; this is not a browser login. */
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const access=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),after:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:access.manager,courseTransaction:access.transaction}));
vi.mock('next/server',()=>({after:access.after}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/queries/course-purchase-roster',()=>({readCommittedCourseRoster:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:()=>true}));
vi.mock('@/server/services/course-store-notices',()=>({recordCourseStoreNotice:vi.fn()}));
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {PrismaClient,type Prisma} from '../../generated/course-client';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
import {installAuditOutboxTestSchema} from './helpers/audit-outbox-test-schema';
import {settleCourseBooking,reserveCourseInTransaction,correctCourseAttendance} from '@/server/services/course-booking';
import {correctMusicRosterAttendance} from '@/server/actions/music-roster-attendance';
import {manageCourseCard} from '@/server/services/course-card-management';
import {isNativeMusicLeaveCard} from '@/server/services/music-native-leave';
import {lockCourseStore} from '@/server/services/course-store-lock';
const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema='music_entitlement_'+randomUUID().replaceAll('-','');
const url=databaseUrl?new URL(databaseUrl):null;url?.searchParams.set('schema',schema);
const db=url?new PrismaClient({datasourceUrl:url.toString()}):null;
const stores:string[]=[];
(databaseUrl?describe:describe.skip)('music leave entitlement real PostgreSQL',()=>{
 beforeAll(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
  await db!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await installAuditOutboxTestSchema(databaseUrl!,db!);
  const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script'],{encoding:'utf8'});
  for(const sql of ddl.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await db!.$executeRawUnsafe(sql);
  for(const sql of [
   'CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text,"operatingStatus" text)',
   'CREATE TABLE "Customer"(id text,"storeId" text,name text,"mergedIntoCustomerId" text,UNIQUE(id,"storeId"))',
   'CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)',
   'CREATE TABLE "SpecialBusinessDay"("storeId" text,date date,type text)',
   'CREATE TABLE "BusinessHours"("storeId" text,"dayOfWeek" int,"isOpen" boolean)',
   'CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"actorRoleSnapshot" text,"loginRecordId" text,"storeId" text,module text,source text,"targetType" text,"targetId" text,action text,summary text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)',
  ])await db!.$executeRawUnsafe(sql);
  // Canonical production SQL, with only public namespace rewritten to this
  // disposable schema. Install real assignment guards and release triggers.
  await db!.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$`);
  const release=readFileSync('scripts/music-production-expand.sql','utf8');
  const assignment=release.slice(release.indexOf('CREATE TABLE public."CourseMusicLessonAssignment"'),release.indexOf('-- Preserve all live native shapes'));
  if(!assignment.includes('CREATE FUNCTION public.music_lesson_assignment_guard()')||!assignment.includes('CREATE TRIGGER music_lesson_assignment_release'))throw Error('Canonical assignment SQL missing');
  for(const chunk of assignment.split(/(CREATE FUNCTION[\s\S]*?END \$fn\$;)/g)){
   const statements=chunk.startsWith('CREATE FUNCTION')?[chunk]:chunk.split(';');
   for(const sql of statements.map(x=>x.trim()).filter(Boolean))await db!.$executeRawUnsafe(sql.replaceAll('public.',`"${schema}".`));
  }
  // Apply the assignment-table part of the production private-table policy.
  await db!.$executeRawUnsafe('ALTER TABLE "CourseMusicLessonAssignment" ENABLE ROW LEVEL SECURITY');
  await db!.$executeRawUnsafe('REVOKE ALL ON "CourseMusicLessonAssignment" FROM PUBLIC,anon,authenticated');
  await db!.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schema}" TO anon,authenticated`);
 },40000);
 afterAll(async()=>{
  vi.useRealTimers();
  for(const store of stores)await db!.$executeRaw`DELETE FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${store}`;
  await db!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db!.$disconnect();
 });
 async function fixture(){
  const storeId=randomUUID(),customerId=randomUUID();stores.push(storeId);
  await db!.$executeRaw`INSERT INTO "Store" VALUES(${storeId},'COURSE','ACTIVE')`;
  await db!.$executeRaw`INSERT INTO "Customer" VALUES(${customerId},${storeId},'Synthetic student',NULL)`;
  await db!.$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES(${storeId},'business.music','ENABLED')`;
  const actor={storeId,userId:'synthetic-manager',name:'Synthetic manager'};
  const run=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>db!.$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);},{timeout:20000});
  const room=await db!.courseRoom.create({data:{storeId,name:'Synthetic room'}});
  const template=await db!.courseTemplate.create({data:{storeId,name:'Synthetic guitar',durationMinutes:60,pointCost:1,capacity:3,classType:'GROUP'}});
  const plan=await db!.coursePointPlan.create({data:{storeId,name:'Synthetic 8 lessons',points:8,price:6400,validDays:70,unit:'SESSION',templateIds:[template.id]}});
  const card=await db!.coursePointCard.create({data:{storeId,planId:plan.id,nameSnapshot:plan.name,unit:'SESSION',remaining:8,templateIds:[template.id],expiresAt:new Date('2027-01-10T15:59:59.999Z'),musicActivatedAt:new Date('2026-11-02T11:00:00Z'),musicValidityDays:70,musicTermSizes:[8],requestKey:randomUUID()}});
  await db!.courseCardMember.create({data:{storeId,cardId:card.id,customerId}});
  const purchase=await db!.coursePurchase.create({data:{storeId,customerId,cardId:card.id,planId:plan.id,name:plan.name,points:8,price:6400,validDays:70,unit:'SESSION',templateIds:[template.id],status:'CONFIRMED',confirmedAt:new Date(),transferLastFive:'',requestKey:randomUUID()}});
  const sessions=[];
  for(const date of ['2026-11-02','2026-12-01','2027-02-01','2026-12-08'])sessions.push(await db!.courseSession.create({data:{storeId,roomId:room.id,templateId:template.id,coachId:'synthetic-teacher',nameSnapshot:template.name,startsAt:new Date(date+'T11:00:00Z'),endsAt:new Date(date+'T12:00:00Z'),pointCost:1,capacity:3,requestKey:randomUUID(),requestIndex:0,createdById:actor.userId}}));
  const booking=await db!.courseBooking.create({data:{storeId,sessionId:sessions[0].id,customerId,bookingKind:'UNPAID',pointCost:0,operatorUserId:actor.userId,operatorName:actor.name,customerName:'Synthetic student',requestKey:randomUUID()}});
  return {actor,run,storeId,customerId,card,purchase,sessions,booking};
 }
 it.each(['2026-12-20','2027-03-01'])('retains paid leave and makeup rights after manual expiry %s',async expiresDate=>{
  const f=await fixture();
  await f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'));
  await f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'));
  const ordinary=await db!.coursePointCard.findUniqueOrThrow({where:{id:f.card.id}});
  const coupon=await db!.coursePointCard.findUniqueOrThrow({where:{storeId_requestKey:{storeId:f.storeId,requestKey:'music-leave-makeup:'+f.booking.id}}});
  expect(ordinary.remaining).toBe(7);expect(coupon.remaining).toBe(1);
  expect(await db!.coursePointEntry.count({where:{bookingId:f.booking.id,kind:'DEBIT'}})).toBe(1);
  const command={expectedStoreId:f.storeId,cardId:f.card.id,operation:'expiry' as const,requestKey:randomUUID(),expectedRemaining:7,expectedExpiresAt:ordinary.expiresAt!.toISOString(),expiresDate,reason:'Synthetic reviewed adjustment'};
  const receipt=await f.run(tx=>manageCourseCard(tx,f.actor,command));
  expect(await f.run(tx=>manageCourseCard(tx,f.actor,command))).toEqual(receipt);
  const input={sessionId:f.sessions[1].id,cardId:coupon.id,customerId:f.customerId,requestKey:randomUUID()};
  const makeup=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,input,null));
  expect((await f.run(tx=>reserveCourseInTransaction(tx,f.actor,input,null))).id).toBe(makeup.id);
  await f.run(tx=>settleCourseBooking(tx,f.actor,makeup.id,'STUDENT_LEAVE'));
  await f.run(tx=>settleCourseBooking(tx,f.actor,makeup.id,'STUDENT_LEAVE'));
  expect(await db!.coursePointCard.findUnique({where:{id:coupon.id}})).toMatchObject({remaining:1,expiresAt:coupon.expiresAt});
  const allocations=await db!.$queryRaw<Array<{bookingId:string;releasedAt:Date|null}>>`SELECT "bookingId","releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"=ANY(${[f.booking.id,makeup.id]}::text[])`;
  expect(allocations.find(a=>a.bookingId===f.booking.id)?.releasedAt).toBeNull();
  expect(allocations.find(a=>a.bookingId===makeup.id)?.releasedAt).toBeInstanceOf(Date);
  const retryInput={...input,sessionId:f.sessions[3].id,requestKey:randomUUID()};
  const [retryMakeup,replayed]=await Promise.all([f.run(tx=>reserveCourseInTransaction(tx,f.actor,retryInput,null)),f.run(tx=>reserveCourseInTransaction(tx,f.actor,retryInput,null))]);
  expect(replayed.id).toBe(retryMakeup.id);
  expect(await db!.coursePointEntry.count({where:{cardId:coupon.id,kind:'GRANT'}})).toBe(1);

  await expect(f.run(tx=>reserveCourseInTransaction(tx,f.actor,{...input,sessionId:f.sessions[2].id,requestKey:randomUUID()},null))).rejects.toThrow('方案已到期或不涵蓋上課日期');
  expect(await db!.coursePointCard.count({where:{storeId:f.storeId,requestKey:{startsWith:'music-leave-makeup:'}}})).toBe(1);
  expect(await db!.coursePurchase.findUnique({where:{id:f.purchase.id}})).toEqual(f.purchase);
  expect(await db!.coursePointCard.findUnique({where:{id:f.card.id}})).toMatchObject({remaining:7,musicValidityDays:null,expiresAt:new Date(expiresDate+'T15:59:59.999Z')});
  // A later adjustment records null days; the original native-policy evidence
  // remains authoritative even when it is no longer the most recent audit.
  await f.run(tx=>manageCourseCard(tx,f.actor,{...command,requestKey:randomUUID(),expectedExpiresAt:receipt.expiresAt,expiresDate:'2027-04-01'}));
  const next=await db!.courseBooking.create({data:{storeId:f.storeId,sessionId:f.sessions[2].id,customerId:f.customerId,bookingKind:'UNPAID',pointCost:0,operatorUserId:f.actor.userId,operatorName:f.actor.name,customerName:'Synthetic student',requestKey:randomUUID()}});
  await f.run(tx=>settleCourseBooking(tx,f.actor,next.id,'STUDENT_LEAVE'));
  await f.run(tx=>settleCourseBooking(tx,f.actor,next.id,'STUDENT_LEAVE'));
  expect(await db!.coursePointCard.findUnique({where:{id:f.card.id}})).toMatchObject({remaining:6,expiresAt:new Date('2027-04-01T15:59:59.999Z')});
  expect(await db!.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:f.storeId,requestKey:'music-leave-makeup:'+next.id}}})).toMatchObject({remaining:1,expiresAt:new Date('2027-04-01T15:59:59.999Z')});
  expect(await db!.coursePurchase.findUnique({where:{id:f.purchase.id}})).toEqual(f.purchase);
 });
 it('serializes concurrent leave retries into one binding, debit and makeup grant',async()=>{
  const f=await fixture();
  const result=await Promise.all([f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE')),f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'))]);
  expect(result[0].id).toBe(result[1].id);
  expect(await db!.courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:'CANCELLED',absenceKind:'STUDENT_LEAVE',bookingKind:'CARD',cardId:f.card.id,pointCost:1});
  expect(await db!.coursePointCard.findUnique({where:{id:f.card.id}})).toMatchObject({remaining:7});
  expect(await db!.coursePointEntry.count({where:{bookingId:f.booking.id,kind:'RESERVE'}})).toBe(1);
  expect(await db!.coursePointEntry.count({where:{bookingId:f.booking.id,kind:'DEBIT'}})).toBe(1);
  const coupon=await db!.coursePointCard.findUniqueOrThrow({where:{storeId_requestKey:{storeId:f.storeId,requestKey:'music-leave-makeup:'+f.booking.id}}});
  expect(coupon.remaining).toBe(1);
  expect(await db!.coursePointEntry.count({where:{cardId:coupon.id,kind:'GRANT'}})).toBe(1);
 });
 it('rolls binding and reservation entries back when leave settlement is rejected',async()=>{
  const f=await fixture();await db!.courseSession.update({where:{id:f.sessions[0].id},data:{teacherAttendance:'LEAVE'}});
  await expect(f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'))).rejects.toThrow('教師未授課');
  expect(await db!.courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:'RESERVED',bookingKind:'UNPAID',cardId:null,pointCost:0});
  expect(await db!.coursePointEntry.count({where:{storeId:f.storeId}})).toBe(0);
  expect(await db!.coursePointCard.count({where:{storeId:f.storeId,requestKey:{startsWith:'music-leave-makeup:'}}})).toBe(0);
  expect(await db!.coursePointCard.findUnique({where:{id:f.card.id}})).toMatchObject({remaining:8});
 });
 it('music roster WAIVED releases only its makeup attempt and replays safely after rebooking',async()=>{
  const f=await fixture();await f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'));
  const coupon=await db!.coursePointCard.findUniqueOrThrow({where:{storeId_requestKey:{storeId:f.storeId,requestKey:'music-leave-makeup:'+f.booking.id}}});
  const makeup=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:f.sessions[1].id,cardId:coupon.id,customerId:f.customerId,requestKey:randomUUID()},null));
  access.manager.mockResolvedValue({storeId:f.storeId,user:{id:f.actor.userId,name:f.actor.name}});
  access.transaction.mockImplementation(async(storeId,work)=>{expect(storeId).toBe(f.storeId);return f.run(work);});
  expect(await correctMusicRosterAttendance({bookingId:makeup.id,expectedStatus:'RESERVED',target:'WAIVED'})).toMatchObject({success:true});
  expect(access.manager).toHaveBeenCalledWith('booking.update');
  const allocation=await db!.$queryRaw<Array<{releasedAt:Date|null}>>`SELECT "releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${makeup.id}`;
  expect(allocation[0].releasedAt).toBeInstanceOf(Date);
  const next=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:f.sessions[3].id,cardId:coupon.id,customerId:f.customerId,requestKey:randomUUID()},null));
  const entries=await db!.coursePointEntry.count({where:{bookingId:makeup.id}});
  expect(await correctMusicRosterAttendance({bookingId:makeup.id,expectedStatus:'CANCELLED',target:'WAIVED'})).toMatchObject({success:true});
  expect(await db!.coursePointEntry.count({where:{bookingId:makeup.id}})).toBe(entries);
  await expect(f.run(tx=>correctCourseAttendance(tx,f.actor,makeup.id,'RESERVED','CANCELLED'))).rejects.toThrow('方案可用額度不足');
  expect(await db!.courseBooking.findUnique({where:{id:makeup.id}})).toMatchObject({status:'CANCELLED',absenceKind:'STUDENT_LEAVE'});
  expect(await db!.courseBooking.findUnique({where:{id:next.id}})).toMatchObject({status:'RESERVED'});
  expect(await db!.coursePointCard.findUnique({where:{id:coupon.id}})).toMatchObject({remaining:1});
  expect(await db!.$queryRaw`SELECT "releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${f.booking.id}`).toEqual([{releasedAt:null}]);
 });
 it('rolls makeup cancellation and allocation release back when its ledger write fails',async()=>{
  const f=await fixture();await f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'));
  const coupon=await db!.coursePointCard.findUniqueOrThrow({where:{storeId_requestKey:{storeId:f.storeId,requestKey:'music-leave-makeup:'+f.booking.id}}});
  const makeup=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:f.sessions[1].id,cardId:coupon.id,customerId:f.customerId,requestKey:randomUUID()},null));
  await db!.$executeRawUnsafe(`ALTER TABLE "CoursePointEntry" ADD CONSTRAINT test_reject_makeup_release_entry CHECK("actorUserId"<>'synthetic-reject-release' OR kind<>'RELEASE')`);
  await expect(f.run(tx=>settleCourseBooking(tx,{...f.actor,userId:'synthetic-reject-release'},makeup.id,'STUDENT_LEAVE'))).rejects.toThrow('test_reject_makeup_release_entry');
  expect(await db!.courseBooking.findUnique({where:{id:makeup.id}})).toMatchObject({status:'RESERVED',absenceKind:null});
  expect(await db!.$queryRaw`SELECT "releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${makeup.id}`).toEqual([{releasedAt:null}]);
  expect(await db!.coursePointCard.findUnique({where:{id:coupon.id}})).toMatchObject({remaining:1});
  expect(await db!.coursePointEntry.count({where:{bookingId:makeup.id,kind:'RELEASE'}})).toBe(0);
 });
 it('keeps canonical guards active and prevents browser roles from reading or mutating allocations',async()=>{
  const f=await fixture();await f.run(tx=>settleCourseBooking(tx,f.actor,f.booking.id,'STUDENT_LEAVE'));
  const guards=await db!.$queryRaw<Array<{tgname:string;tgenabled:string;prosecdef:boolean}>>`SELECT t.tgname,t.tgenabled,p.prosecdef FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${schema} AND t.tgname IN ('music_lesson_assignment_guard','music_lesson_assignment_release')`;
  expect(guards).toHaveLength(2);expect(guards.every(g=>g.tgenabled==='O'&&!g.prosecdef)).toBe(true);
  const original=await db!.$queryRaw<Array<{period:number;ordinal:number}>>`SELECT period,ordinal FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${f.booking.id}`;
  expect(original).toEqual([{period:1,ordinal:1}]);
  await expect(db!.$executeRaw`UPDATE "CourseMusicLessonAssignment" SET period=999 WHERE "bookingId"=${f.booking.id}`).rejects.toThrow('outside purchased periods');
  await expect(db!.$executeRaw`DELETE FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${f.booking.id}`).rejects.toThrow('history cannot be deleted');
  for(const role of ['anon','authenticated']){
   const privileges=await db!.$queryRaw<Array<{table_allowed:boolean;function_allowed:boolean;rls:boolean}>>`SELECT has_table_privilege(${role},${schema+'."CourseMusicLessonAssignment"'},'SELECT,INSERT,UPDATE,DELETE') table_allowed,has_function_privilege(${role},${schema+'.music_lesson_assignment_guard()'},'EXECUTE') function_allowed,(SELECT relrowsecurity FROM pg_class WHERE oid=${schema+'."CourseMusicLessonAssignment"'}::regclass) rls`;
   expect(privileges).toEqual([{table_allowed:false,function_allowed:false,rls:true}]);
   await expect(db!.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);return tx.$queryRaw`SELECT * FROM "CourseMusicLessonAssignment"`;})).rejects.toThrow('permission denied');
  }
  // Even a deliberate temporary SELECT grant cannot bypass enabled RLS when
  // no browser policy exists. This transaction rolls the grant back afterwards.
  await expect(db!.$transaction(async tx=>{
   await tx.$executeRawUnsafe('GRANT SELECT ON "CourseMusicLessonAssignment" TO authenticated');
   await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
   expect(await tx.$queryRaw`SELECT * FROM "CourseMusicLessonAssignment"`).toEqual([]);
   throw Error('rollback temporary grant');
  })).rejects.toThrow('rollback temporary grant');
 });
 it('requires exact audit ownership, numeric native history and one confirmed purchase',async()=>{
  const f=await fixture();await db!.coursePointCard.update({where:{id:f.card.id},data:{musicValidityDays:null}});
  const card=await db!.coursePointCard.findUniqueOrThrow({where:{id:f.card.id}});
  for(const [store,target,type,days] of [
   ['other-store',card.id,'CoursePointCard',70],[f.storeId,'other-card','CoursePointCard',70],
   [f.storeId,card.id,'CustomerPlanWallet',70],[f.storeId,card.id,'CoursePointCard','70'],
   [f.storeId,card.id,'CoursePointCard',null],[f.storeId,card.id,'CoursePointCard',0],
  ] as const){
   await db!.$executeRaw`INSERT INTO "AuditLog"(id,"storeId","targetId","targetType",action,"beforeJson") VALUES(${randomUUID()},${store},${target},${type},'CARD_EXPIRY',${JSON.stringify({musicValidityDays:days})}::jsonb)`;
  }
  expect(await f.run(tx=>isNativeMusicLeaveCard(tx,f.storeId,card))).toBe(false);
  await db!.$executeRaw`INSERT INTO "AuditLog"(id,"storeId","targetId","targetType",action,"beforeJson") VALUES(${randomUUID()},${f.storeId},${card.id},'CoursePointCard','CARD_EXPIRY','{"musicValidityDays":70}'::jsonb)`;
  expect(await f.run(tx=>isNativeMusicLeaveCard(tx,f.storeId,card))).toBe(true);
  await db!.coursePurchase.update({where:{id:f.purchase.id},data:{voidedAt:new Date()}});
  expect(await f.run(tx=>isNativeMusicLeaveCard(tx,f.storeId,card))).toBe(false);
 });
});
