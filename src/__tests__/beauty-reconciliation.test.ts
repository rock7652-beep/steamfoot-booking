import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),transaction:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({requireBeauty:m.scope,beautyTransaction:m.transaction}));
import {checkBeautyAccounts} from '@/server/reconciliation/beauty-checks';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`
 CREATE TABLE "BeautyTransactionRevision" ("storeId" text,"transactionId" text,revision int,"voidedAt" timestamptz);
 CREATE TABLE "BeautyCard" (id text,"storeId" text,remaining int,"closedAt" timestamptz);
 CREATE TABLE "BeautyLedger" (id text,"storeId" text,"cardId" text,"appointmentId" text,delta int);
 CREATE TABLE "BeautyAppointment" (id text,"storeId" text,"cardId" text,status text,debit bool,"technicianId" text,"locationId" text,"startsAt" timestamptz,"occupiedEndsAt" timestamptz);
 CREATE TABLE "BeautyPayment" (id text,"storeId" text,"originalPaymentId" text,kind text,amount int,method text,"voidedAt" timestamptz);
 CREATE TABLE "CashbookEntry" (id text,"storeId" text,amount int,type text,"paymentMethod" text,"entryDate" date);
 `);});afterAll(()=>db.close());
beforeEach(async()=>{vi.resetAllMocks();m.scope.mockResolvedValue(undefined);m.transaction.mockImplementation(async(_a,work)=>work({$queryRaw:async(parts:TemplateStringsArray,...values:unknown[])=>(await db.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows}));await db.exec(`
 TRUNCATE "BeautyTransactionRevision","BeautyCard","BeautyLedger","BeautyAppointment","BeautyPayment","CashbookEntry";
 INSERT INTO "BeautyCard" VALUES ('card','s',7,null),('foreign','outside',-99,null);
 INSERT INTO "BeautyLedger" VALUES ('grant','s','card',null,8),('debit','s','card','done',-1);
 INSERT INTO "BeautyAppointment" VALUES ('done','s','card','COMPLETED',true,'t','r','2026-10-23T01:00Z','2026-10-23T02:00Z'),('held','s','card','RESERVED',false,'t','r','2026-10-23T02:00Z','2026-10-23T03:00Z');
 INSERT INTO "BeautyPayment" VALUES ('sale','s',null,'SALE',1000,'OTHER',null),('refund','s','sale','REFUND',-200,'CASH',null);
 INSERT INTO "CashbookEntry" VALUES ('beauty:sale','s',1000,'INCOME','OTHER','2026-10-23'),('beauty:refund','s',200,'EXPENSE','CASH','2026-10-24');
 `);});
it('cross-checks true balances, debit, holds, cash and adjacent slots without including another store',async()=>{const rows=await checkBeautyAccounts('s');expect(rows).toHaveLength(5);expect(rows.every(r=>r.status==='pass')).toBe(true);expect(m.transaction).toHaveBeenCalledWith({storeId:'s',userId:null},expect.any(Function));});
it.each([
 ['beauty_balance',`UPDATE "BeautyCard" SET remaining=6 WHERE id='card'`],
 ['beauty_holds',`UPDATE "BeautyCard" SET "closedAt"=now() WHERE id='card'`],
 ['beauty_debit',`UPDATE "BeautyAppointment" SET debit=false WHERE id='done'`],
 ['beauty_cash',`DELETE FROM "CashbookEntry" WHERE id='beauty:refund'`],
 ['beauty_cash',`UPDATE "BeautyPayment" SET amount=-1200 WHERE id='refund'`],
 ['beauty_cash',`INSERT INTO "BeautyTransactionRevision" VALUES ('s','sale',1,now())`],
 ['beauty_resources',`INSERT INTO "BeautyAppointment" VALUES ('conflict','s',null,'RESERVED',false,'t','other','2026-10-23T02:30Z','2026-10-23T03:30Z')`],
])('exposes %s inconsistencies instead of hiding them',async(code,sql)=>{await db.exec(sql);const rows=await checkBeautyAccounts('s');expect(rows.find(r=>r.checkCode===code)?.status).toBe('mismatch');});
it('validates unused-card void against the original accounting day and keeps the original receipt',async()=>{await db.exec(`DELETE FROM "BeautyPayment" WHERE id='refund';DELETE FROM "CashbookEntry" WHERE id='beauty:refund';INSERT INTO "BeautyTransactionRevision" VALUES ('s','sale',1,now());INSERT INTO "CashbookEntry" VALUES ('beauty-void:sale','s',1000,'EXPENSE','OTHER','2026-10-23')`);expect((await checkBeautyAccounts('s')).find(r=>r.checkCode==='beauty_cash')?.status).toBe('pass');await db.exec(`UPDATE "CashbookEntry" SET "entryDate"='2026-10-24' WHERE id='beauty-void:sale'`);expect((await checkBeautyAccounts('s')).find(r=>r.checkCode==='beauty_cash')?.status).toBe('mismatch');});
it('propagates source failures and wrong module so the engine records an error',async()=>{m.scope.mockRejectedValue(Error('wrong module'));await expect(checkBeautyAccounts('s')).rejects.toThrow('wrong module');expect(m.transaction).not.toHaveBeenCalled();});
