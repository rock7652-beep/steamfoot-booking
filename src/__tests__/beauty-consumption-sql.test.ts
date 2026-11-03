import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {customerConsumptionSql} from '@/server/queries/customer-consumption-sql';
import {parseConsumptionFilters,type ConsumptionParams} from '@/lib/customer-consumption';
import type {ConsumptionResult} from '@/server/queries/customer-consumption';
const db=new PGlite();
const now=new Date('2026-10-22T04:00:00Z');
const customers=[{id:'owner',name:'購買人',phone:'0900',assignedStaffName:'店長'},{id:'member',name:'家人',phone:'0901',assignedStaffName:null},{id:'zero',name:'零消耗',phone:'0902',assignedStaffName:null}];
beforeAll(async()=>{await db.exec(`
CREATE TABLE "BeautyCard" (id text,"storeId" text,"customerId" text,"memberIds" text[],"planId" text,name text,sessions int,remaining int,"closedAt" timestamptz,"expiresAt" timestamptz);
CREATE TABLE "BeautyAppointment" (id text,"storeId" text,"customerId" text,"cardId" text,"startsAt" timestamptz,status text,debit boolean);
CREATE TABLE "BeautyLedger" (id text,"storeId" text,"cardId" text,"appointmentId" text,kind text,delta int);
CREATE TABLE "BeautyPayment" (id text,"storeId" text,"cardId" text,"appointmentId" text,kind text,amount int,"createdAt" timestamptz);
`);});
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec(`TRUNCATE "BeautyCard","BeautyAppointment","BeautyLedger","BeautyPayment";
INSERT INTO "BeautyCard" VALUES ('card','store','owner',ARRAY['owner','member'],'plan','共用十次',10,7,NULL,'2026-12-01');
INSERT INTO "BeautyAppointment" VALUES
('visit','store','member','card','2026-10-20T01:00Z','COMPLETED',true),
('cancel','store','member','card','2026-10-20T01:00Z','CANCELLED',true),
('noshow','store','owner','card','2026-10-20T01:00Z','NO_SHOW',true),
('freecancel','store','owner','card','2026-10-20T01:00Z','CANCELLED',false),
('restored','store','owner','card','2026-10-20T01:00Z','RESERVED',false),
('future','store','owner','card','2026-10-23T01:00Z','COMPLETED',true),
('cash','store','owner',NULL,'2026-10-20T01:00Z','COMPLETED',true),
('guest','store',NULL,'card','2026-10-20T01:00Z','COMPLETED',true),
('foreign','else','member','card','2026-10-20T01:00Z','COMPLETED',true);
INSERT INTO "BeautyLedger" VALUES
('l1','store','card','visit','CORRECTION',-1),('l2','store','card','cancel','CORRECTION',-1),
('l3','store','card','noshow','CORRECTION',-1),('l4','store','card','restored','CORRECTION',-1),('l5','store','card','restored','CORRECTION',1),
('l6','store','card','future','CORRECTION',-1),('l7','store','card','guest','CORRECTION',-1),
('hold','store','card','freecancel','RESERVE',0),('wrong','else','card','visit','CORRECTION',-99);
INSERT INTO "BeautyPayment" VALUES
('buy','store','card',NULL,'SALE',10000,'2026-10-19T16:00Z'),
('sale','store',NULL,'cash','SALE',1000,'2026-10-20T02:00Z'),
('ref','store',NULL,'cash','REFUND',-100,'2026-10-21T02:00Z'),
('old','store','card',NULL,'REFUND',-500,'2026-09-01T02:00Z'),
('fee','store',NULL,'cash','FEE',500,'2026-10-20T02:00Z');
`);});
async function report(params:ConsumptionParams={}, scope=customers, exporting=false){
const filters=parseConsumptionFilters({preset:'custom',startDate:'2026-10-20',endDate:'2026-10-31',...params});
const sql=customerConsumptionSql('store','beauty',null,filters,exporting,now,scope);
return (await db.query<ConsumptionResult>(sql.text,sql.values.map(v=>v instanceof Date?v.toISOString():v))).rows[0];}
describe('Beauty consumption on isolated PostgreSQL without User/Staff access',()=>{
it('attributes each service to its attendee, purchase to buyer and never double counts shared balance',async()=>{
const {rows}=await report();expect(rows.find(r=>r.id==='member')).toMatchObject({count:2,amount:0,paid:0});expect(rows.find(r=>r.id==='owner')).toMatchObject({count:2,paid:10900,amount:900});expect(rows.find(r=>r.id==='member')?.balances).toContain('共用十次（共用）：剩餘 7 次');expect(rows.find(r=>r.id==='zero')).toMatchObject({count:0,paid:0});
});
it('excludes cancellation/no-show deductions on request but preserves receipts',async()=>{const {rows}=await report({includeAbsent:'0'});expect(rows.find(r=>r.id==='member')?.count).toBe(1);expect(rows.find(r=>r.id==='owner')).toMatchObject({count:1,paid:10900});});
it('matches plan across usage, purchases and balances',async()=>{const {rows}=await report({planId:'plan'});expect(rows).toHaveLength(2);expect(rows.find(r=>r.id==='owner')).toMatchObject({count:1,amount:0,paid:10000});});
it('single payment excludes all card use and balance',async()=>{const {rows}=await report({planId:'__single__'});expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:'owner',count:1,amount:900,paid:900,balances:''});});
it('restoration removes previous consumption even if the appointment is later corrected again',async()=>{await db.exec(`UPDATE "BeautyAppointment" SET status='COMPLETED',debit=true WHERE id='restored'`);expect((await report()).rows.find(r=>r.id==='owner')?.count).toBe(2);});
it('does not use payer or names to assign anonymous guests',async()=>{expect((await report()).rows.reduce((s,r)=>s+r.count,0)).toBe(4);});
it('never leaks a customer omitted by current core visibility',async()=>{const {rows}=await report({},customers.filter(c=>c.id==='member'));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:'member',count:2,paid:0});});
it('uses payment date for cross-period refund and service date for consumption',async()=>{const {rows}=await report({startDate:'2026-10-21',endDate:'2026-10-21'});expect(rows.find(r=>r.id==='owner')).toMatchObject({count:0,paid:-100});});
it('honors ranges/top/order and returns same CSV rows',async()=>{const params={count_min:'1',sort:'paid',direction:'asc',top:'1'};const a=await report(params),b=await report(params,customers,true);expect(a.matched).toBe(2);expect(a.rows[0].id).toBe('member');expect(b.rows).toEqual(a.rows);});
it('removed members and expired/closed cards no longer show a usable shared balance',async()=>{await db.exec(`UPDATE "BeautyCard" SET "memberIds"=ARRAY['owner']`);expect((await report()).rows.find(r=>r.id==='member')?.balances).toBe('');await db.exec(`UPDATE "BeautyCard" SET "closedAt"='2026-10-21'`);expect((await report()).rows.find(r=>r.id==='owner')?.balances).toBe('');});
it('fails closed without authorized core identity input',()=>{expect(()=>customerConsumptionSql('store','beauty',null,parseConsumptionFilters({}))).toThrow('authorized core customer scope');});
});
