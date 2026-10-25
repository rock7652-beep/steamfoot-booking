import { PGlite } from "@electric-sql/pglite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
import { syncMusicSubjectTeachers } from "@/server/services/music-teaching-qualifications";
let db:PGlite;
beforeEach(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE "User"(id text primary key,status text); CREATE TABLE "Staff"(id text primary key,"userId" text,"storeId" text,status text,"courseQualifiedTemplateIds" text[],"courseCoachEnabled" boolean,"courseQualificationsConfirmed" boolean,"updatedAt" timestamptz default now()); CREATE TABLE "CourseTemplate"(id text primary key,"storeId" text,"musicSubjectId" text);
    INSERT INTO "User" VALUES('u1','ACTIVE'),('u2','ACTIVE');
    INSERT INTO "Staff"(id,"userId","storeId",status,"courseQualifiedTemplateIds","courseCoachEnabled","courseQualificationsConfirmed") VALUES('t1','u1','music','ACTIVE',ARRAY['a1','b1'],true,true),('t2','u2','music','ACTIVE',ARRAY['b1'],true,true);
    INSERT INTO "CourseTemplate" VALUES('a1','music','A'),('a2','music','A'),('b1','music','B'),('foreign','other','A');`);
});
afterEach(async()=>{await db.close();});
function adapter(sql:{query:(q:string,v?:unknown[])=>Promise<{rows:unknown[]}>}) {
  const query=async(parts:TemplateStringsArray,...values:unknown[])=>{
    const q=parts.reduce((out,part,i)=>out+part+(i<values.length?`$${i+1}`:""),"");
    return (await sql.query(q,values)).rows;
  };
  return {$queryRaw:query,$executeRaw:query,courseTemplate:{findMany:async({where}:{where:{storeId:string;musicSubjectId:string}})=>(await sql.query('SELECT id FROM "CourseTemplate" WHERE "storeId"=$1 AND "musicSubjectId"=$2',[where.storeId,where.musicSubjectId])).rows}} as unknown as Prisma.TransactionClient;
}
async function qualifications(){return (await db.query('SELECT id,"courseQualifiedTemplateIds" AS ids FROM "Staff" ORDER BY id')).rows;}
it("updates every fee version together and retains unrelated teaching qualifications",async()=>{
  const authorize=vi.fn();
  await db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t2'],['t1'],authorize));
  expect(authorize).toHaveBeenCalledOnce();
  expect(await qualifications()).toEqual([{id:'t1',ids:['b1']},{id:'t2',ids:['b1','a1','a2']}]);
});
it("new fee versions inherit existing qualifications without changing the selected teachers",async()=>{
  const authorize=vi.fn();
  await db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t1'],['t1'],authorize));
  expect(authorize).not.toHaveBeenCalled();
  expect(await qualifications()).toEqual([{id:'t1',ids:['a1','b1','a2']},{id:'t2',ids:['b1']}]);
});
it("stale fee forms cannot overwrite a newer teacher selection",async()=>{
  const before=await qualifications();
  await expect(db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t2'],[],vi.fn()))).rejects.toThrow('已有更新');
  expect(await qualifications()).toEqual(before);
});
it("denied staff management leaves all teachers unchanged",async()=>{
  const before=await qualifications();
  await expect(db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t2'],['t1'],async()=>{throw new Error('denied');}))).rejects.toThrow('denied');
  expect(await qualifications()).toEqual(before);
});
it("rejects foreign teachers before writing",async()=>{
  const before=await qualifications();
  await expect(db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['foreign'],['t1'],vi.fn()))).rejects.toThrow('本店啟用');
  expect(await qualifications()).toEqual(before);
});
it("accepts active teaching identities without enabling their suspended backend account",async()=>{
  await db.exec(`UPDATE "User" SET status='SUSPENDED' WHERE id='u2'`);
  await db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t1','t2'],['t1'],vi.fn()));
  expect(await qualifications()).toEqual([{id:'t1',ids:['a1','b1','a2']},{id:'t2',ids:['b1','a1','a2']}]);
  expect((await db.query(`SELECT status FROM "User" WHERE id='u2'`)).rows).toEqual([{status:'SUSPENDED'}]);
});
it("still refuses a newly selected inactive teacher even when their login account is active",async()=>{
  await db.exec(`UPDATE "Staff" SET status='INACTIVE' WHERE id='t2'`);
  const before=await qualifications();
  await expect(db.transaction(sql=>syncMusicSubjectTeachers(adapter(sql),'music','A',['t1','t2'],['t1'],vi.fn()))).rejects.toThrow('本店啟用');
  expect(await qualifications()).toEqual(before);
});
it("rolls back an earlier teacher write if a later write fails",async()=>{
  const before=await qualifications();
  await expect(db.transaction(async sql=>{const tx=adapter(sql),execute=tx.$executeRaw.bind(tx);let calls=0;tx.$executeRaw=(async(...args:Parameters<typeof execute>)=>{if(++calls===2)throw new Error('write failed');return execute(...args);}) as typeof tx.$executeRaw;return syncMusicSubjectTeachers(tx,'music','A',['t2'],['t1'],vi.fn());})).rejects.toThrow('write failed');
  expect(await qualifications()).toEqual(before);
});
