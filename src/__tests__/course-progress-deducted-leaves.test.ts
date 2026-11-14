import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import type {Prisma} from '../../generated/course-client';
import {readProgressDeductedLeaveIds} from '@/server/services/course-progress-deducted-leaves';
let db:PGlite;
const tx={$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{
 const sql=strings.reduce((text,part,i)=>text+(i?`$${i}`:'')+part,'');
 return (await db.query(sql,values)).rows;
}} as unknown as Pick<Prisma.TransactionClient,'$queryRaw'>;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE "CourseBooking" (id text PRIMARY KEY,"storeId" text,"cardId" text,status text,"absenceKind" text,"pointCost" int);
 CREATE TABLE "CoursePointEntry" (id text PRIMARY KEY,"storeId" text,"cardId" text,"bookingId" text,kind text,"createdAt" timestamp);`);
});
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 await db.exec(`TRUNCATE "CourseBooking","CoursePointEntry";
 INSERT INTO "CourseBooking" VALUES ('lesson','store','card','CANCELLED','STUDENT_LEAVE',1);`);
});
const entry=async(id:string,kind:string,time='2026-11-01 12:00:00',card='card',store='store')=>{
 await db.query('INSERT INTO "CoursePointEntry" VALUES ($1,$2,$3,$4,$5,$6)',[id,store,card,'lesson',kind,time]);
};
it('requires a proven current deduction and keeps it independent of a separate makeup right',async()=>{
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual([]);
 await entry('debit','DEBIT');
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual(['lesson']);
});
it.each(['RELEASE','RELEASE:correction','CORRECT:NO_SHOW:CANCELLED:correction'])('drops a deducted leave after %s returns or corrects the settlement',async kind=>{
 await entry('debit','DEBIT');await entry('return',kind,'2026-11-02');
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual([]);
 await entry('again','DEBIT:repeat','2026-11-03');
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual(['lesson']);
});
it('does not guess which same-time conflicting settlement came last',async()=>{
 await entry('debit','DEBIT');await entry('return','RELEASE:correction');
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual([]);
});
it.each([['RESERVED','STUDENT_LEAVE'],['CANCELLED',null],['CANCELLED','TEACHER_ABSENT']])('does not mark %s / %s as deducted leave',async(status,absence)=>{
 await entry('debit','DEBIT');await db.query('UPDATE "CourseBooking" SET status=$1,"absenceKind"=$2',[status,absence]);
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual([]);
});
it('ignores non-deducting leave and scopes proof to the original store, card and booking',async()=>{
 await entry('released','RELEASE');await entry('foreign-card','DEBIT','2026-11-02','another');await entry('foreign-store','DEBIT','2026-11-02','card','another');
 expect(await readProgressDeductedLeaveIds(tx,'store',['card'])).toEqual([]);
 expect(await readProgressDeductedLeaveIds(tx,'another',['card'])).toEqual([]);
 expect(await readProgressDeductedLeaveIds(tx,'store',['another'])).toEqual([]);
 expect(await readProgressDeductedLeaveIds(tx,'store',[])).toEqual([]);
});
