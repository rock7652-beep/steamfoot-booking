import {PGlite} from '@electric-sql/pglite';
import {afterEach,expect,it,vi} from 'vitest';
import {settleCompletedPlanForVoid} from '@/server/beauty/online-confirm-guard';
import type {Tx} from '@/server/beauty/booking';
afterEach(()=>vi.unstubAllEnvs());
async function fixture(){
 vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');
 const db=new PGlite();await db.exec(`CREATE TABLE "BeautyPurchaseIntent"("storeId" text,"requestKey" text,"customerId" text,status text,fingerprint text,"cardId" text,"updatedAt" timestamptz,PRIMARY KEY("storeId","requestKey"));CREATE TABLE "BeautyOnlineConfirmIntent"("storeId" text,"requestKey" text,"orderId" text);INSERT INTO "BeautyPurchaseIntent" VALUES('shop','original','customer','COMMITTED','hash','card',now()),('foreign','foreign-key','foreign-customer','COMMITTED','hash','foreign-card',now());`);
 const tx={$queryRaw:async(parts:TemplateStringsArray,...values:unknown[])=>{const sql=parts.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),'');return (await db.query(sql,values)).rows;}} as unknown as Tx;
 return {db,tx};
}
it('acknowledges only the exact committed card and rolls back the marker if later void validation fails',async()=>{
 const {db,tx}=await fixture();try{
  await db.exec('BEGIN');await settleCompletedPlanForVoid(tx,{storeId:'shop',manager:true,userId:'owner'},{cardId:'card',customerId:'customer'});
  expect((await db.query<{status:string}>('SELECT status FROM "BeautyPurchaseIntent" WHERE "storeId"=\'shop\'')).rows[0].status).toBe('ACKNOWLEDGED');
  // The caller's financial guard rejects the void: this is the same transaction.
  await db.exec('ROLLBACK');expect((await db.query<{status:string}>('SELECT status FROM "BeautyPurchaseIntent" WHERE "storeId"=\'shop\'')).rows[0].status).toBe('COMMITTED');
  await db.exec('BEGIN');await settleCompletedPlanForVoid(tx,{storeId:'shop',manager:true,userId:'owner'},{cardId:'card',customerId:'customer'});await db.exec('COMMIT');
  expect((await db.query<{status:string}>('SELECT status FROM "BeautyPurchaseIntent" WHERE "storeId"=\'foreign\'')).rows[0].status).toBe('COMMITTED');
 }finally{await db.close();}
},30000);
