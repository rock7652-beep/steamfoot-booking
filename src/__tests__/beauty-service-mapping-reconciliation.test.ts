import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {snapshotStoredChargeRule} from '@/lib/beauty/charge-rule-storage';
const sql=readFileSync('scripts/reconciliation/beauty-soulife-service-60-20261102.sql','utf8');
const shop='store-soulife',old='cmvnqg79e0003l107x1dblb29',canonical='cmvylytr5001cjv07xi12f46q';
const rule=(id:string,revision=1)=>JSON.stringify({version:1,rule:{storeId:shop,chargeId:id,revision,mode:'LEGACY_UNRESTRICTED',serviceIds:[old]}});
async function fixture(){
 const db=new PGlite();await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text,"operatingStatus" text);INSERT INTO "Store" VALUES('${shop}','BEAUTY','ACTIVE');
 CREATE TABLE "BeautyService"(id text PRIMARY KEY,"storeId" text,duration int,buffer int,active bool,revision int,price int,"defaultRate" jsonb,"chargeTechnicianRule" jsonb);
 CREATE TABLE "BeautyPlan"(id text PRIMARY KEY,"storeId" text,name text,price int,sessions int,"serviceIds" text[],revision int,"chargeTechnicianRule" jsonb);
 CREATE TABLE "BeautyCard"(id text PRIMARY KEY,"storeId" text,"planId" text,"customerId" text,remaining int,sessions int,paid int,"serviceIds" text[],"chargeRuleSnapshot" jsonb);
 CREATE TABLE "BeautyAppointment"(id text PRIMARY KEY,"storeId" text,"serviceId" text,"cardId" text,status text,price int,fee int,"chargeRuleSnapshot" jsonb);
 CREATE TABLE "BeautyEvent"(id text PRIMARY KEY,"storeId" text,kind text,status text,body text,"createdAt" timestamptz);`);
 for(const [id,price] of [[old,1600],[canonical,1100]] as const)await db.query('INSERT INTO "BeautyService" VALUES($1,$2,60,10,true,1,$3,\'{"mode":"FIXED","value":500}\',$4)',[id,shop,price,rule('service:'+id)]);
 for(const id of ['p5','p10'])await db.query('INSERT INTO "BeautyPlan" VALUES($1,$2,$1,5500,5,$3,1,$4)',[id,shop,[old],rule('plan:'+id)]);
 for(const [id,remaining] of [['used',4],['new1',5],['new2',5]] as const)await db.query('INSERT INTO "BeautyCard" VALUES($1,$2,\'p5\',\'customer\',$3,5,5500,$4,$5)',[id,shop,remaining,[old],rule('plan:p5')]);
 await db.query('INSERT INTO "BeautyCard" VALUES(\'foreign\',\'other\',\'p5\',\'foreign\',5,5,5500,$1,$2)',[[old],rule('plan:p5')]);
 await db.query('INSERT INTO "BeautyAppointment" VALUES(\'history\',$1,$2,\'used\',\'COMPLETED\',1100,400,$3)',[shop,old,rule('plan:p5')]);
 return db;
}
it('corrects service scopes while preserving 10 unused sessions, historical money and unrelated store data',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  const {rows:cards}=await db.query<{id:string;remaining:number;paid:number;serviceIds:string[];chargeRuleSnapshot:unknown}>('SELECT * FROM "BeautyCard" ORDER BY id');
  expect(cards.find(c=>c.id==='foreign')!.serviceIds).toEqual([old]);
  for(const c of cards.filter(c=>c.id!=='foreign')){expect(c.paid).toBe(5500);expect(c.serviceIds).toContain(canonical);expect(()=>snapshotStoredChargeRule(c.chargeRuleSnapshot,{storeId:shop,chargeId:'plan:p5',revision:1,serviceIds:c.serviceIds},shop,'snapshot')).not.toThrow();}
  expect(cards.filter(c=>c.id.startsWith('new')).reduce((n,c)=>n+c.remaining,0)).toBe(10);
  const {rows:[history]}=await db.query<{serviceId:string;price:number;fee:number;chargeRuleSnapshot:{rule:{serviceIds:string[]}}}>('SELECT * FROM "BeautyAppointment"');
  expect(history).toMatchObject({serviceId:old,price:1100,fee:400});expect(history.chargeRuleSnapshot.rule.serviceIds).toEqual([old,canonical]);
  await db.exec(sql);expect((await db.query('SELECT id FROM "BeautyEvent"')).rows).toHaveLength(1);
 }finally{await db.close();}
},30000);
it('rolls back if current impact changed rather than silently missing a new card',async()=>{
 const db=await fixture();try{await db.query('INSERT INTO "BeautyCard" VALUES(\'extra\',$1,\'p5\',\'customer\',5,5,5500,$2,$3)',[shop,[old],rule('plan:p5')]);await expect(db.exec(sql)).rejects.toThrow('Card impact changed');await db.exec('ROLLBACK');expect((await db.query('SELECT id FROM "BeautyEvent"')).rows).toHaveLength(0);expect((await db.query<{active:boolean}>('SELECT active FROM "BeautyService" WHERE id=$1',[old])).rows[0].active).toBe(true);}finally{await db.close();}
},30000);
