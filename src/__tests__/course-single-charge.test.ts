import {describe,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {courseChargeSettings,quoteCourseCharge} from '@/lib/course-charge-settings';
import {resolveScheduleCharge} from '@/server/services/course-charge';
import type {Prisma} from '../../generated/course-client';
const settings={kind:'single' as const,durationMinutes:60,trialPrice:0,trialDuration:20,providerIds:['teacher']};
describe('single charge pricing and attendance classification',()=>{
 it('distinguishes no trial from a free trial and inherits a blank duration',()=>{
  expect(quoteCourseCharge(settings,true,false,499)).toEqual({duration:20,trialPrice:0});
  expect(quoteCourseCharge({...settings,trialDuration:null},true,false,499).duration).toBe(60);
  expect(()=>quoteCourseCharge({...settings,trialPrice:null},true,false,499)).toThrow('未開放體驗');
  expect(quoteCourseCharge(settings,false,false,499).trialPrice).toBeNull();
 });
 it('uses the store default for open sports regardless of fee trial price',()=>{
  expect(quoteCourseCharge(settings,true,true,499).trialPrice).toBe(499);
  expect(courseChargeSettings.safeParse({...settings,providerIds:['teacher','teacher']}).success).toBe(false);
  expect(courseChargeSettings.safeParse({...settings,kind:'plan'}).success).toBe(false);
 });
 it('validates the store, teaching qualification and per-fee teacher without changing shared qualifications',async()=>{
  const tx={coursePointPlan:{findFirst:vi.fn().mockResolvedValue({id:'fee',name:'鋼琴單次',price:800,templateIds:['template'],sportsMode:'LEGACY',chargeSettings:settings})},courseTemplate:{findFirst:vi.fn().mockResolvedValue({id:'template',musicSubjectId:'piano'}),findMany:vi.fn().mockResolvedValue([{id:'template',musicSubjectId:'piano'}])},$queryRaw:vi.fn().mockResolvedValue([{id:'teacher',qualificationIds:['template']}])};
  const input={chargePlanId:'fee',templateId:'template',coachId:'teacher',isTrial:true,open:false,defaultTrialPrice:499,durationMinutes:60};
  const quote=await resolveScheduleCharge(tx as unknown as Prisma.TransactionClient,'store',input);
  expect(quote).toMatchObject({duration:20,trialPrice:0,snapshot:{isTrial:true,price:800}});
  expect(tx.coursePointPlan.findFirst).toHaveBeenCalledWith({where:{storeId:'store',id:'fee',isActive:true}});
  await expect(resolveScheduleCharge(tx as unknown as Prisma.TransactionClient,'store',{...input,coachId:'other'})).rejects.toThrow('未開放');
  tx.coursePointPlan.findFirst.mockResolvedValue({id:'fee',name:'通用單次',price:800,templateIds:[],sportsMode:'OPEN',chargeSettings:{...settings,providerIds:['teacher','other-subject-teacher']}});
  await expect(resolveScheduleCharge(tx as unknown as Prisma.TransactionClient,'store',{...input,open:true,sports:true})).resolves.toMatchObject({trialPrice:499});
  tx.coursePointPlan.findFirst.mockResolvedValue({id:'fee',name:'鋼琴單次',price:800,templateIds:['template'],sportsMode:'LEGACY',chargeSettings:settings});
  tx.$queryRaw.mockResolvedValue([{id:'teacher',qualificationIds:['unrelated']}]);
  await expect(resolveScheduleCharge(tx as unknown as Prisma.TransactionClient,'store',input)).rejects.toThrow('資格');
  tx.coursePointPlan.findFirst.mockResolvedValue(null);
  await expect(resolveScheduleCharge(tx as unknown as Prisma.TransactionClient,'other-store',input)).rejects.toThrow('不屬於本店');
 });
 it('adds nullable storage without changing legacy rows and keeps booked quotes after fee edits',async()=>{
  const db=new PGlite();try{
   await db.exec('CREATE TABLE "CoursePointPlan" (id TEXT PRIMARY KEY); CREATE TABLE "CourseSession" (id TEXT PRIMARY KEY); INSERT INTO "CoursePointPlan" VALUES (\'legacy\'); INSERT INTO "CourseSession" VALUES (\'legacy\');');
   await db.exec(readFileSync('prisma/migrations/20261025170000_course_single_charge/migration.sql','utf8'));
   expect((await db.query('SELECT "chargeSettings" FROM "CoursePointPlan"')).rows).toEqual([{chargeSettings:null}]);
   const snapshot={planId:'fee',name:'鋼琴',price:800,settings,trialPrice:0,isTrial:true};
   await db.query('INSERT INTO "CoursePointPlan" VALUES ($1,$2)', ['fee',settings]);
   await db.query('INSERT INTO "CourseSession" VALUES ($1,$2)', ['booked',snapshot]);
   await db.query('UPDATE "CoursePointPlan" SET "chargeSettings"=$1 WHERE id=$2',[{...settings,trialPrice:999,trialDuration:45},'fee']);
   expect((await db.query<{chargeSnapshot:typeof snapshot}>('SELECT "chargeSnapshot" FROM "CourseSession" WHERE id=$1',['booked'])).rows[0].chargeSnapshot).toEqual(snapshot);
  }finally{await db.close();}
 });
});
