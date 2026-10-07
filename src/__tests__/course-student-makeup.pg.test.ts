import { installAuditOutboxTestSchema } from "./helpers/audit-outbox-test-schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { reserveCourseInTransaction, settleCourseBooking, correctCourseAttendance } from "@/server/services/course-booking";
import { lockCourseStore } from "@/server/services/course-store-lock";
const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema=`music_makeup_${randomUUID().replaceAll("-","")}`;
const url=databaseUrl?new URL(databaseUrl):null;url?.searchParams.set("schema",schema);
const db=url?new PrismaClient({datasourceUrl:url.toString()}):null;
(databaseUrl?describe:describe.skip)("music makeup — isolated real PostgreSQL",()=>{
 let created=false;
  const fixtureStoreIds = new Set<string>();
 beforeAll(async()=>{
  await db!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await installAuditOutboxTestSchema(databaseUrl!, db!);
  const ddl=execFileSync("node_modules/.bin/prisma",["migrate","diff","--from-empty","--to-schema-datamodel","course-prisma/schema.prisma","--script"],{encoding:"utf8"});
  for(const sql of ddl.split(";").map(s=>s.trim()).filter(Boolean))await db!.$executeRawUnsafe(sql);
  await db!.$executeRawUnsafe('ALTER TABLE "CourseBooking" DROP COLUMN "makeupForBookingId"');
  const migration=readFileSync("supabase/migrations/20260928101128_course_student_makeup_link.sql","utf8").replaceAll('public.',`"${schema}".`);
  for(const sql of migration.split(";").map(s=>s.trim()).filter(Boolean))await db!.$executeRawUnsafe(sql);
  for(const sql of [
   'CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text)',
   'CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,name text,"mergedIntoCustomerId" text)',
   'CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text)',
   'CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)',
   'CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" int,"isOpen" boolean)',
  ])await db!.$executeRawUnsafe(sql);
 },30000);
 afterAll(async()=>{vi.useRealTimers();for (const storeId of fixtureStoreIds) await db!.$executeRaw`DELETE FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${storeId}`;if(created)await db!.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await db?.$disconnect();});
 async function fixture(){
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2030-01-10T00:00:00Z"));
  const storeId=randomUUID(),customerId=randomUUID(); fixtureStoreIds.add(storeId);
  await db!.$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
  await db!.$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'驗收學員',NULL)`;
  await db!.$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES (${storeId},'business.music','ENABLED')`;
  const room=await db!.courseRoom.create({data:{storeId,name:"驗收教室"}});
  const template=await db!.courseTemplate.create({data:{storeId,name:"個別四堂",durationMinutes:60,pointCost:1,capacity:1,classType:"PRIVATE",musicTermLessons:4}});
  const plan=await db!.coursePointPlan.create({data:{storeId,name:"四堂",points:4,price:3200,validDays:35,unit:"SESSION",templateIds:[template.id],musicTerms:1}});
  const card=await db!.coursePointCard.create({data:{storeId,planId:plan.id,nameSnapshot:plan.name,unit:"SESSION",templateIds:[template.id],remaining:4,expiresAt:new Date("2031-01-01"),requestKey:randomUUID()}});
  await db!.courseCardMember.create({data:{storeId,cardId:card.id,customerId}});
  const sessions=[];
  for(const date of ["2030-01-09","2030-01-11","2030-01-12"]){sessions.push(await db!.courseSession.create({data:{storeId,templateId:template.id,roomId:room.id,coachId:"teacher",nameSnapshot:"驗收課",startsAt:new Date(date+"T10:00:00Z"),endsAt:new Date(date+"T11:00:00Z"),pointCost:1,capacity:1,requestKey:randomUUID(),requestIndex:0,createdById:"manager"}}));}
  const source=await db!.courseBooking.create({data:{storeId,sessionId:sessions[0].id,cardId:card.id,customerId,operatorUserId:"manager",operatorName:"店長",customerName:"驗收學員",pointCost:1,requestKey:randomUUID()}});
  const actor={storeId,userId:"manager",name:"店長"};
  const transact=<T>(run:(tx:Prisma.TransactionClient)=>Promise<T>)=>db!.$transaction(async tx=>{await lockCourseStore(tx,storeId);return run(tx);});
  await transact(tx=>settleCourseBooking(tx,actor,source.id,"STUDENT_LEAVE"));
  const input={sessionId:sessions[1].id,cardId:card.id,customerId,requestKey:randomUUID(),makeupForBookingId:source.id};
  return {storeId,customerId,card,source,sessions,actor,transact,input};
 }
 it("leaves without debit, reserves once, attends once and persists both dates",async()=>{
  const f=await fixture();
  expect((await db!.coursePointCard.findUnique({where:{id:f.card.id}}))!.remaining).toBe(4);
  const [a,b]=await Promise.all([f.transact(tx=>reserveCourseInTransaction(tx,f.actor,f.input,100)),f.transact(tx=>reserveCourseInTransaction(tx,f.actor,f.input,100))]);
  expect(a.id).toBe(b.id);
  const evidence = await db!.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${f.storeId} AND payload->>'targetId'=${a.id}`;
  expect(Number(evidence[0].count)).toBe(1);
  vi.setSystemTime(new Date("2030-01-11T12:00:00Z"));
  await f.transact(tx=>settleCourseBooking(tx,f.actor,a.id,"ATTENDED"));
  await f.transact(tx=>settleCourseBooking(tx,f.actor,a.id,"ATTENDED"));
  const actual=await db!.courseBooking.findUnique({where:{id:a.id},include:{session:true}});
  const original=await db!.courseBooking.findUnique({where:{id:f.source.id},include:{session:true}});
  expect(actual).toMatchObject({status:"ATTENDED",makeupForBookingId:f.source.id});
  expect(actual!.session.startsAt.toISOString()).toBe("2030-01-11T10:00:00.000Z");
  expect(original).toMatchObject({status:"CANCELLED",absenceKind:"STUDENT_LEAVE"});
  expect(original!.session.startsAt.toISOString()).toBe("2030-01-09T10:00:00.000Z");
  expect(await db!.coursePointEntry.count({where:{bookingId:a.id,kind:"DEBIT"}})).toBe(1);
  expect((await db!.coursePointCard.findUnique({where:{id:f.card.id}}))!.remaining).toBe(3);
  await f.transact(tx=>correctCourseAttendance(tx,f.actor,a.id,"RESERVED","ATTENDED"));
  expect((await db!.coursePointCard.findUnique({where:{id:f.card.id}}))!.remaining).toBe(4);
 });
 it("cancelling makeup releases the original leave; rebooking uses the same lesson",async()=>{
  const f=await fixture();const a=await f.transact(tx=>reserveCourseInTransaction(tx,f.actor,f.input,100));
  await expect(f.transact(tx=>correctCourseAttendance(tx,f.actor,f.source.id,"RESERVED","CANCELLED"))).rejects.toThrow("先取消補課");
  await f.transact(tx=>settleCourseBooking(tx,f.actor,a.id,"CANCELLED"));
  const b=await f.transact(tx=>reserveCourseInTransaction(tx,f.actor,{...f.input,sessionId:f.sessions[2].id,requestKey:randomUUID()},100));
  expect(b.makeupForBookingId).toBe(f.source.id);
  expect((await db!.coursePointCard.findUnique({where:{id:f.card.id}}))!.remaining).toBe(4);
  expect(await db!.courseBooking.count({where:{storeId:f.storeId,makeupForBookingId:f.source.id,status:"RESERVED"}})).toBe(1);
 });
 it("two concurrent schedules cannot claim the same leave twice",async()=>{
  const f=await fixture();
  const outcomes=await Promise.allSettled([f.transact(tx=>reserveCourseInTransaction(tx,f.actor,f.input,100)),f.transact(tx=>reserveCourseInTransaction(tx,f.actor,{...f.input,sessionId:f.sessions[2].id,requestKey:randomUUID()},100))]);
  expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1);
  expect(await db!.courseBooking.count({where:{storeId:f.storeId,makeupForBookingId:f.source.id,status:"RESERVED"}})).toBe(1);
 });
 it("enforces store isolation and quota even for makeup reservations",async()=>{
  const a=await fixture(),b=await fixture();
  await expect(b.transact(tx=>reserveCourseInTransaction(tx,b.actor,{...b.input,makeupForBookingId:a.source.id},100))).rejects.toThrow("原方案");
  await expect(a.transact(tx=>reserveCourseInTransaction(tx,a.actor,a.input,0))).rejects.toThrow("額度上限");
  expect(await db!.courseBooking.count({where:{makeupForBookingId:{in:[a.source.id,b.source.id]}}})).toBe(0);
 });
});
