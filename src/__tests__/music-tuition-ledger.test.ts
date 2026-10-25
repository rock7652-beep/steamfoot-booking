import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
import {receiveMusicTuition} from "@/server/services/music-tuition";
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:(s:string)=>s==="staging"}));
const db=new PGlite();
async function raw(strings:TemplateStringsArray,...values:unknown[]){return (await db.query(strings.reduce((s,v,i)=>s+(i?`$${i}`:"")+v,""),values)).rows;}
const tx={
 $queryRaw:raw,$executeRaw:raw,
 coursePurchase:{findFirst:async({where}:{where:{id:string;storeId:string}})=>(await db.query('SELECT * FROM "CoursePurchase" WHERE id=$1 AND "storeId"=$2',[where.id,where.storeId])).rows[0],update:async({where,data}:{where:{id:string};data:{price:number}})=>db.query('UPDATE "CoursePurchase" SET price=$1 WHERE id=$2',[data.price,where.id])},
} as unknown as Prisma.TransactionClient;
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE "CoursePurchase"(id text primary key,"storeId" text,"cardId" text,name text,status text,price integer CHECK(price>=0),"voidedAt" timestamptz,"paymentMethod" text, CHECK(price<>0 OR "paymentMethod"='DISCOUNT'),UNIQUE(id,"storeId"));
 CREATE TYPE "CashbookPaymentMethod" AS ENUM('CASH','OTHER');
 CREATE TABLE "CashbookEntry"(id text primary key,"storeId" text,"entryDate" date,type text,"paymentMethod" "CashbookPaymentMethod",category text,amount integer,note text,"createdByUserId" text,"updatedAt" timestamptz);
 CREATE TABLE "AuditLog"(id text primary key,"actorUserId" text,"targetType" text,"targetId" text,action text,"afterJson" jsonb,"createdAt" timestamptz);
 CREATE TABLE "CashDrawerSession"(id text,"storeId" text,"businessDate" date,status text,"updatedAt" timestamptz);`);
 await db.exec(readFileSync('supabase/migrations/20261016003312_music_tuition_receipts_preview.sql','utf8'));
 await db.exec(`INSERT INTO "CoursePurchase" VALUES('p','staging','card','驗收','CONFIRMED',0,NULL,'DISCOUNT');INSERT INTO "CourseMusicTuition"("purchaseId","storeId",due,"checkoutFingerprint") VALUES('p','staging',9600,'snapshot');`);
});
afterAll(()=>db.close());
const actor={storeId:"staging",userId:"tester"};
const input={purchaseId:"p",amount:3200,paymentDate:"2026-10-01",method:"BANK_TRANSFER",lastFour:"1234",requestKey:"first",expectedReceived:0};
it("partial receipt, retry and top-up keep exactly two financial entries and never issue a card",async()=>{
 await receiveMusicTuition(tx,actor,input);
 await receiveMusicTuition(tx,actor,input);
 await expect(receiveMusicTuition(tx,actor,{...input,amount:100})).rejects.toThrow("請求已使用");
 await expect(receiveMusicTuition(tx,actor,{...input,requestKey:"stale",amount:6400})).rejects.toThrow("已更新");
 await expect(receiveMusicTuition(tx,actor,{...input,requestKey:"over",amount:6401,expectedReceived:3200})).rejects.toThrow("不得超過");
 await receiveMusicTuition(tx,actor,{...input,requestKey:"second",amount:6400,expectedReceived:3200,paymentDate:"2026-10-02"});
 expect((await db.query('SELECT price,"cardId" FROM "CoursePurchase"')).rows).toEqual([{price:9600,cardId:"card"}]);
 expect((await db.query('SELECT count(*)::int AS count,sum(amount)::int AS amount FROM "CourseMusicReceipt"')).rows).toEqual([{count:2,amount:9600}]);
 expect((await db.query('SELECT count(*)::int AS count,sum(amount)::int AS amount FROM "CashbookEntry"')).rows).toEqual([{count:2,amount:9600}]);
});
it("rejects another store, refunded purchase and missing cash drawer",async()=>{
 await expect(receiveMusicTuition(tx,{...actor,storeId:"production"},input)).rejects.toThrow("尚未啟用");
 await db.exec(`UPDATE "CoursePurchase" SET status='REFUNDED'`);
 await expect(receiveMusicTuition(tx,actor,{...input,requestKey:"refund"})).rejects.toThrow("無法補繳");
 await db.exec(`UPDATE "CoursePurchase" SET status='CONFIRMED';UPDATE "CourseMusicTuition" SET due=10000`);
 await expect(receiveMusicTuition(tx,actor,{...input,requestKey:"cash",amount:400,expectedReceived:9600,method:"CASH"})).rejects.toThrow("現金抽屜");
 expect((await db.query('SELECT count(*)::int AS count FROM "CourseMusicReceipt"')).rows[0]).toEqual({count:2});
});

it("records the first receipt against the actual paid purchase snapshot atomically",async()=>{
 await db.exec(`INSERT INTO "CoursePurchase" VALUES('initial','staging','initial-card','首收','CONFIRMED',200,NULL,'OTHER');INSERT INTO "CourseMusicTuition"("purchaseId","storeId",due,"checkoutFingerprint") VALUES('initial','staging',640,'initial');`);
 await receiveMusicTuition(tx,actor,{...input,purchaseId:"initial",amount:200,requestKey:"initial",initial:true});
 expect((await db.query('SELECT price FROM "CoursePurchase" WHERE id=\'initial\'')).rows).toEqual([{price:200}]);
 expect((await db.query('SELECT sum(amount)::int AS amount FROM "CourseMusicReceipt" WHERE "purchaseId"=\'initial\'')).rows).toEqual([{amount:200}]);
});
