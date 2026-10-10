import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,expect,it} from "vitest";
import {writeInitialSpaStaff} from "@/server/services/spa-initial-staff-write";
import {spaSkillId} from "@/lib/spa-store-identifiers";
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`
 CREATE TABLE "SpaSkill" (id text primary key,"storeId" text,name text,"isActive" bool,"sortOrder" int,"createdAt" timestamp,"updatedAt" timestamp,unique(id,"storeId"));
 CREATE TABLE "SpaStaffSkill" ("storeId" text,"staffId" text,"skillId" text,primary key("staffId","skillId"),foreign key("skillId","storeId") references "SpaSkill"(id,"storeId"));
 CREATE TABLE "SpaStaffAvailability" (id text primary key,"storeId" text,"staffId" text,"dayOfWeek" int,"startTime" text,"endTime" text,"isActive" bool,"createdAt" timestamp,"updatedAt" timestamp,unique("storeId","staffId","dayOfWeek"));
 CREATE TABLE "SpaStaffCompensation" (id text primary key,"storeId" text,"staffId" text unique,mode text,value numeric,"isActive" bool,"createdAt" timestamp,"updatedAt" timestamp);
 `);});
afterAll(async()=>db.close());beforeEach(async()=>db.exec('TRUNCATE "SpaStaffSkill","SpaStaffAvailability","SpaStaffCompensation","SpaSkill";'));
async function save(data:Parameters<typeof writeInitialSpaStaff>[3]){return db.transaction(async connection=>writeInitialSpaStaff({$executeRaw:async(s:TemplateStringsArray,...values:unknown[])=>{const sql=s.reduce((r,p,i)=>r+(i?`$${i}`:"")+p,"");return (await connection.query(sql,values)).affectedRows;}} as never,"s","p",data));}
it("executes actual skill/availability/compensation SQL atomically and retains explicit zero compensation",async()=>{
 await save({spaSkillKeys:["body","foot"],spaWeeklyAvailability:[{dayOfWeek:1,startTime:"10:00",endTime:"18:00"}],spaCompensation:{mode:"PERCENTAGE",value:0}});
 expect((await db.query('SELECT count(*) FROM "SpaStaffSkill"')).rows).toEqual([{count:2}]);expect((await db.query('SELECT "startTime" FROM "SpaStaffAvailability"')).rows).toEqual([{startTime:"10:00"}]);expect((await db.query('SELECT value::int AS value FROM "SpaStaffCompensation"')).rows).toEqual([{value:0}]);
});
it("a later failure rolls back all earlier setup rows",async()=>{
 await expect(save({spaSkillKeys:["body"],spaWeeklyAvailability:[{dayOfWeek:1,startTime:"10:00",endTime:"18:00"},{dayOfWeek:1,startTime:"10:00",endTime:"18:00"}]})).rejects.toThrow();expect((await db.query('SELECT count(*) FROM "SpaSkill"')).rows).toEqual([{count:0}]);expect((await db.query('SELECT count(*) FROM "SpaStaffAvailability"')).rows).toEqual([{count:0}]);
});
it("foreign skill or compensation ownership cannot be overwritten, with complete rollback",async()=>{
 await db.query('INSERT INTO "SpaSkill" (id,"storeId",name) VALUES ($1,\'other\',\'other\')',[spaSkillId("s","body")]);await expect(save({spaSkillKeys:["body"]})).rejects.toThrow("其他門市");expect((await db.query('SELECT name FROM "SpaSkill"')).rows).toEqual([{name:"other"}]);
 await db.exec(`INSERT INTO "SpaStaffCompensation" (id,"storeId","staffId",mode,value) VALUES ('foreign','other','p','FIXED',99)`);await expect(save({spaSkillKeys:["foot"],spaCompensation:{mode:"FIXED",value:10}})).rejects.toThrow("不屬於本店");expect((await db.query('SELECT count(*) FROM "SpaStaffSkill"')).rows).toEqual([{count:0}]);expect((await db.query('SELECT value::int AS value FROM "SpaStaffCompensation"')).rows).toEqual([{value:99}]);
});
