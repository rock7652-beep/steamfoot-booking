import {beforeAll,afterAll,beforeEach,expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '../../generated/course-client';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>true}));
vi.mock('@/lib/sports-staging',()=>({sportsStagingEnabled:async()=>true,requireSportsStaging:async()=>{}}));
import {assertSportsSeriesFree} from '@/server/services/sports-permanent-series';
import {assertSportsRentalFree} from '@/server/services/sports-staging-schedule';
import {rentalConflict} from '@/server/services/course-rental';

// Never use application DB credentials. This suite requires an empty, dedicated
// loopback PostgreSQL database; it does not reset an existing schema.
const url=resolveBookingConcurrencyTestDatabaseUrl(process.env);
if(url&&new URL(url).pathname!=='/steamfoot_conflict_test')throw Error('Dedicated conflict test database required');
const db=url?new PrismaClient({datasourceUrl:url}):null;
const test=url?it:it.skip;
const at=(date:string,time='09:00')=>new Date(`${date}T${time}:00+08:00`);
const range=(date:string)=>({startsAt:at(date),endsAt:at(date,'10:00')});
const store='conflict-qa';
const resources={roomId:'room',coachId:'coach'};
function session(date:string,key:string){return {storeId:store,templateId:'template',...resources,...range(date),nameSnapshot:'合成課程',pointCost:1,capacity:1,requestKey:key,requestIndex:0,createdById:'qa'};}
beforeAll(async()=>{
 if(!db)return;
 const rows=await db.$queryRawUnsafe<Array<{count:bigint}>>(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`);
 if(Number(rows[0].count)!==0)throw Error('Refusing to modify a nonempty test database');
 const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script'],{encoding:'utf8'});
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 await db.$executeRawUnsafe('CREATE TABLE "SportsPreviewScheduleSeries" (LIKE "CourseScheduleSeries" INCLUDING ALL)');
 await db.$executeRawUnsafe('CREATE TABLE "BeautyAppointment" (id text PRIMARY KEY,"storeId" text,"locationId" text,status text,"startsAt" timestamptz,"occupiedEndsAt" timestamptz)');
 await db.courseRoom.create({data:{id:'room',storeId:store,name:'合成教室'}});
 await db.courseTemplate.create({data:{id:'template',storeId:store,name:'合成課程',durationMinutes:60,pointCost:1,capacity:1}});
},60000);
beforeEach(async()=>{
 if(!db)return;
 await db.courseSession.deleteMany();await db.courseRental.deleteMany();await db.courseScheduleSeries.deleteMany();
 await db.$executeRawUnsafe('DELETE FROM "SportsPreviewScheduleSeries"');await db.$executeRawUnsafe('DELETE FROM "BeautyAppointment"');
});
afterAll(async()=>{await db?.$disconnect();});
async function fixed(){
 const {requestIndex,...data}=session('2026-11-02','weekly');
 void requestIndex;
 await db!.courseScheduleSeries.create({data:{id:'sports-series:qa',...data,frequency:'WEEKLY',generatedThrough:at('2026-11-02'),updatedAt:new Date()}});
 await db!.$executeRawUnsafe('INSERT INTO "SportsPreviewScheduleSeries" SELECT * FROM "CourseScheduleSeries"');
}
test('real Prisma/SQL: cancellation frees only that occurrence, not the following week',async()=>{
 await fixed();await db!.courseSession.create({data:{...session('2026-11-23','weekly'),cancelledAt:new Date()}});
 await expect(db!.$transaction(tx=>assertSportsSeriesFree(tx,store,[range('2026-11-23')],resources))).resolves.toBeUndefined();
 await expect(db!.$transaction(tx=>assertSportsSeriesFree(tx,store,[range('2026-11-30')],resources))).rejects.toThrow('2026-11-30');
});
test('real transaction: later conflict rolls back earlier writes; corrected batch persists',async()=>{
 await fixed();
 await expect(db!.$transaction(async tx=>{
  await tx.courseSession.create({data:session('2026-11-24','batch')});
  await assertSportsSeriesFree(tx,store,[range('2026-11-30')],resources);
 })).rejects.toThrow('持續固定課');
 expect(await db!.courseSession.count({where:{requestKey:'batch'}})).toBe(0);
 await db!.$transaction(async tx=>{await assertSportsSeriesFree(tx,store,[range('2026-11-24')],resources);await tx.courseSession.create({data:session('2026-11-24','batch')});});
 expect(await db!.courseSession.count({where:{requestKey:'batch'}})).toBe(1);
});
test('real queries report later fixed-schedule conflicts and every requested rental date',async()=>{
 for(const date of ['2026-11-23','2026-11-30'])await db!.courseRental.create({data:{storeId:store,roomId:'room',customerName:'合成顧客',customerPhone:'0900000000',...range(date),occupiedStartsAt:at(date),occupiedEndsAt:at(date,'10:15'),hourlyRateSnapshot:0,amount:0,requestKey:date,createdById:'qa'}});
 await expect(db!.$transaction(tx=>assertSportsSeriesFree(tx,store,[range('2026-11-02')],resources,'new-fixed','WEEKLY'))).rejects.toThrow(/2026-11-23.*2026-11-30/);
 await expect(db!.$transaction(tx=>assertSportsRentalFree(tx,store,'room',[range('2026-11-23'),range('2026-11-30')]))).rejects.toThrow(/10:15.*2026-11-30/);
});
test('real Beauty rental SQL preserves midnight buffer, cancellation, tenant and exact-end boundaries',async()=>{
 await db!.$executeRawUnsafe(`INSERT INTO "BeautyAppointment" VALUES
 ('occupied','conflict-qa','room','RESERVED','2026-11-23T15:30Z','2026-11-23T16:15Z'),
 ('cancelled','conflict-qa','room','CANCELLED','2026-11-23T16:15Z','2026-11-23T18:00Z'),
 ('foreign','another-store','room','RESERVED','2026-11-23T16:15Z','2026-11-23T18:00Z')`);
 await expect(db!.$transaction(tx=>rentalConflict(tx,store,'room',at('2026-11-24','00:00'),at('2026-11-24','01:00'),undefined,true))).rejects.toThrow('2026-11-23 23:30–2026-11-24 00:15');
 await expect(db!.$transaction(tx=>rentalConflict(tx,store,'room',at('2026-11-24','00:15'),at('2026-11-24','01:00'),undefined,true))).resolves.toBeUndefined();
});
