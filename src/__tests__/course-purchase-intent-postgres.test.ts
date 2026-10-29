import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/course-scheduling-modes",()=>({assertCoursePlanMode:vi.fn()}));
vi.mock("@/server/services/music-tuition",()=>({readMusicTuition:vi.fn(async()=>new Map()),receiveMusicTuition:vi.fn()}));
vi.mock("@/server/services/course-term",()=>({validateCourseTerm:vi.fn(async()=>[]),enrollCourseTerm:vi.fn()}));
vi.mock("@/server/services/course-sale-allocation",()=>({courseSaleSnapshot:vi.fn(async()=>({storeCostSnapshot:0,developerProfitSnapshot:0,developerNameSnapshot:null,revenueStaffId:null}))}));
vi.mock("@/server/services/plan-activation-enqueue",()=>({enqueuePlanActivation:vi.fn()}));
vi.mock("@/server/services/plan-activation-notification-kick",()=>({kickPlanActivationNotifications:vi.fn()}));
import { lockCourseStore } from "@/server/services/course-store-lock";
import { acknowledgeCourseIntent, assertCourseIntentForCheckout, cancelCourseIntent, commitCourseIntent, prepareCourseIntent, prepareCourseIntentAtomic, readCourseIntent, readPendingCourseIntent } from "@/server/services/course-purchase-intent";
import { parseCoursePurchaseIntentInput } from "@/server/services/course-purchase-intent-input";
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";
import type { Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
type PoolClient = { query: (text:string, values?:unknown[]) => Promise<{rows:Record<string,unknown>[];rowCount:number|null}>; release:()=>void };
type PoolInstance = { connect:()=>Promise<PoolClient>;end:()=>Promise<void> };
const { Pool } = createRequire(import.meta.url)("pg") as {Pool:new (options:{connectionString:string|undefined;max:number})=>PoolInstance};

// Explicit local/isolated database only; never infer DATABASE_URL or production credentials.
const url=resolveBookingConcurrencyTestDatabaseUrl({BOOKING_CONCURRENCY_TEST_DATABASE_URL:process.env.COURSE_INTENT_TEST_DATABASE_URL});
const suite=url ? describe : describe.skip;
suite("course purchase intent with real PostgreSQL store locking",()=>{
  const schema=`intent_course_${randomUUID().replaceAll("-", "")}`;
  const restrictedRole=`intent_read_${randomUUID().replaceAll("-", "")}`;
  const pool=new Pool({connectionString:url,max:8});
  const store="qa-store", customer="qa-customer", actor={storeId:store,userId:"qa-actor"};
  const input=(key=randomUUID(), overrides:Record<string,unknown>={})=>parseCoursePurchaseIntentInput({planId:"qa-plan",customerId:customer,expiresDate:"2099-12-31",requestKey:key,discountKind:"AMOUNT",discountValue:0,paymentMethod:"CARD",expectedListPrice:1000,...overrides});
  function adapter(c:PoolClient): Prisma.TransactionClient {
    const run=(strings:TemplateStringsArray,...values:unknown[])=>c.query(strings.reduce((s,x,i)=>s+x+(i<values.length?`$${i+1}`:""),""),values);
    const saved=async (table:"CoursePurchase"|"CoursePointCard",storeId:string,requestKey:string)=>{const r=await c.query(`SELECT id,"customerId",payload FROM "${table}" WHERE "storeId"=$1 AND "requestKey"=$2`,[storeId,requestKey]);const row=r.rows[0];return row?{...(row.payload as Record<string,unknown>),id:row.id,customerId:row.customerId}:null};
    return { $queryRaw:async (strings:TemplateStringsArray,...values:unknown[])=>(await run(strings,...values)).rows,
      $executeRaw:async (strings:TemplateStringsArray,...values:unknown[])=>(await run(strings,...values)).rowCount,
      coursePointPlan:{findFirst:async()=>({id:"qa-plan",storeId:store,name:"QA",points:10,price:0,validDays:365,unit:"SESSION",templateIds:[],termSessionIds:[],storeCost:0,musicTerms:null})},
      coursePointCard:{findUnique:async({where}:{where:{storeId_requestKey:{storeId:string;requestKey:string}}})=>saved("CoursePointCard",where.storeId_requestKey.storeId,where.storeId_requestKey.requestKey),findFirst:async({where}:{where:{id:string;storeId:string}})=>{const r=await c.query('SELECT payload FROM "CoursePointCard" WHERE id=$1 AND "storeId"=$2',[where.id,where.storeId]);const payload=r.rows[0]?.payload as Record<string,unknown>|undefined;return payload?{...payload,expiresAt:new Date(String(payload.expiresAt))}:null},create:async({data}:{data:Record<string,unknown>})=>{const id=randomUUID();await c.query('INSERT INTO "CoursePointCard" (id,"storeId","requestKey","customerId",payload) VALUES ($1,$2,$3,$4,$5)',[id,store,data.requestKey,(data.members as {create:{customerId:string}}).create.customerId,JSON.stringify(data)]);return {...data,id}}},
      coursePurchase:{findUnique:async ({where}:{where:{storeId_requestKey:{storeId:string;requestKey:string}}})=>saved("CoursePurchase",where.storeId_requestKey.storeId,where.storeId_requestKey.requestKey),create:async({data}:{data:Record<string,unknown>})=>{const id=randomUUID();await c.query('INSERT INTO "CoursePurchase" (id,"storeId","requestKey","customerId",payload) VALUES ($1,$2,$3,$4,$5)',[id,store,data.requestKey,data.customerId,JSON.stringify(data)]);return {...data,id}}}
    } as unknown as Prisma.TransactionClient;
  }
  async function transaction<T>(work:(tx:Prisma.TransactionClient,c:PoolClient)=>Promise<T>):Promise<T>{
    const c=await pool.connect();try{await c.query("BEGIN");await c.query(`SET LOCAL search_path TO "${schema}"`);const tx=adapter(c);await lockCourseStore(tx,store);const result=await work(tx,c);await c.query("COMMIT");return result;}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
  }
  beforeAll(async()=>{
    vi.stubEnv("AUTH_SECRET","synthetic-test-secret-which-is-long-enough");
    const c=await pool.connect();try{await c.query(`CREATE SCHEMA "${schema}"`);await c.query(`SET search_path TO "${schema}"`);
      await c.query('CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text NOT NULL)');
      await c.query('CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text NOT NULL,"mergedIntoCustomerId" text,UNIQUE("storeId",id))');
      await c.query('CREATE TABLE "CoursePurchase" (id text PRIMARY KEY,"storeId" text NOT NULL,"requestKey" text NOT NULL,"customerId" text NOT NULL,payload jsonb NOT NULL DEFAULT \'{}\',UNIQUE("storeId","requestKey"),UNIQUE(id,"storeId"))');
      await c.query('CREATE TABLE "CoursePointCard" (id text PRIMARY KEY,"storeId" text NOT NULL,"requestKey" text NOT NULL,"customerId" text NOT NULL,payload jsonb NOT NULL,UNIQUE("storeId","requestKey"))');
      await c.query('CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"targetType" text,"targetId" text,action text,"afterJson" jsonb,"createdAt" timestamptz)');
      await c.query(readFileSync("prisma/migrations/20261028111122_course_purchase_intent/migration.sql","utf8"));
      await c.query(`CREATE ROLE "${restrictedRole}" NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${restrictedRole}"`);
      await c.query(`GRANT SELECT ON "CoursePurchaseIntent" TO "${restrictedRole}"`);
      await c.query('INSERT INTO "Store" (id,"industryModule") VALUES ($1,$2)',[store,"COURSE"]);
      for(const name of [customer,"qa-customer-two","qa-race","qa-cancel-first","qa-rls","qa-rotation","qa-real-checkout","qa-six","qa-atomic-race"])await c.query('INSERT INTO "Customer" (id,"storeId") VALUES ($1,$2)',[name,store]);
    }finally{c.release()}
  });
  afterAll(async()=>{const c=await pool.connect();try{await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await c.query(`DROP ROLE IF EXISTS "${restrictedRole}"`)}finally{c.release();await pool.end();vi.unstubAllEnvs()}});
  it("late prepare and late checkout both fail after cancellation tombstone",async()=>{
    const data=input();expect((await transaction(tx=>cancelCourseIntent(tx,actor,customer,data.requestKey))).status).toBe("CANCELLED");
    await expect(transaction(tx=>prepareCourseIntent(tx,actor,data))).rejects.toThrow("已取消");
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,data))).rejects.toThrow("已取消");
  });
  it("two devices atomically discover one pending purchase and bar the late losing key",async()=>{
    const first=input(randomUUID(),{customerId:"qa-atomic-race"}),second=input(randomUUID(),{customerId:"qa-atomic-race"});
    const results=await Promise.all([transaction(tx=>prepareCourseIntentAtomic(tx,actor,first)),transaction(tx=>prepareCourseIntentAtomic(tx,actor,second))]);
    expect(results.filter(r=>r.kind==="prepared")).toHaveLength(1);expect(results.filter(r=>r.kind==="existing")).toHaveLength(1);
    const winner=results[0].kind==="prepared"?first:second,loser=winner===first?second:first;
    expect(results.find(r=>r.kind==="existing")?.intent.requestKey).toBe(winner.requestKey);
    expect((await transaction(tx=>readCourseIntent(tx,store,loser.customerId,loser.requestKey)))?.status).toBe("CANCELLED");
    await transaction(tx=>cancelCourseIntent(tx,actor,winner.customerId,winner.requestKey));
    await expect(transaction(tx=>prepareCourseIntentAtomic(tx,actor,loser))).rejects.toThrow("已取消");
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,loser))).rejects.toThrow("已取消");
  });
  it("concurrent keys serialize; committed but unseen blocks until acknowledgement",async()=>{
    const c1="qa-customer-two", first=input(randomUUID(),{customerId:c1}), second=input(randomUUID(),{customerId:c1});
    const outcomes=await Promise.allSettled([transaction(tx=>prepareCourseIntent(tx,actor,first)),transaction(tx=>prepareCourseIntent(tx,actor,second))]);
    expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(x=>x.status==="rejected")).toHaveLength(1);
    const chosen=outcomes[0].status==="fulfilled"?first:second;
    await transaction(async(tx,c)=>{await assertCourseIntentForCheckout(tx,store,chosen);await c.query('INSERT INTO "CoursePurchase" (id,"storeId","requestKey","customerId") VALUES ($1,$2,$3,$4)',["qa-purchase",store,chosen.requestKey,c1]);await commitCourseIntent(tx,store,chosen,"qa-purchase")});
    expect((await transaction(tx=>readPendingCourseIntent(tx,store,c1)))?.status).toBe("COMMITTED");
    await expect(transaction(tx=>prepareCourseIntent(tx,actor,input(randomUUID(),{customerId:c1})))).rejects.toThrow("待確認");
    expect((await transaction(tx=>acknowledgeCourseIntent(tx,actor,c1,chosen.requestKey))).status).toBe("COMMITTED");
    expect((await transaction(tx=>acknowledgeCourseIntent(tx,actor,c1,chosen.requestKey))).status).toBe("COMMITTED");
    expect(await transaction(tx=>readPendingCourseIntent(tx,store,c1))).toBeNull();
    const next=input(randomUUID(),{customerId:c1});expect((await transaction(tx=>prepareCourseIntent(tx,actor,next))).status).toBe("PREPARED");await transaction(tx=>cancelCourseIntent(tx,actor,c1,next.requestKey));
  });
  it("cancel and checkout cannot both win under the actual store row lock",async()=>{
    const data=input(randomUUID(),{customerId:"qa-race"});await transaction(tx=>prepareCourseIntent(tx,actor,data));
    let entered!:()=>void, release!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r),releasePromise=new Promise<void>(r=>release=r);
    const checkout=transaction(async(tx,c)=>{await assertCourseIntentForCheckout(tx,store,data);entered();await releasePromise;await c.query('INSERT INTO "CoursePurchase" (id,"storeId","requestKey","customerId") VALUES ($1,$2,$3,$4)',["qa-race-purchase",store,data.requestKey,data.customerId]);await commitCourseIntent(tx,store,data,"qa-race-purchase")});
    await enteredPromise;const cancellation=transaction(tx=>cancelCourseIntent(tx,actor,data.customerId,data.requestKey));release();await checkout;
    expect((await cancellation).status).toBe("COMMITTED");
  });
  it("a cancellation holding the store lock wins over a late checkout",async()=>{
    const data=input(randomUUID(),{customerId:"qa-cancel-first"});await transaction(tx=>prepareCourseIntent(tx,actor,data));
    let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
    const cancellation=transaction(async tx=>{const result=await cancelCourseIntent(tx,actor,data.customerId,data.requestKey);entered();await gate;return result});
    await ready;const checkout=expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,data))).rejects.toThrow("已取消");release();expect((await cancellation).status).toBe("CANCELLED");
    await checkout;
  });
  it("database partial uniqueness and RLS both fail closed",async()=>{
    const data=input(randomUUID(),{customerId:"qa-rls"});await transaction(tx=>prepareCourseIntent(tx,actor,data));
    const c=await pool.connect();try{await c.query(`SET search_path TO "${schema}"`);
      await expect(c.query('INSERT INTO "CoursePurchaseIntent" ("storeId","customerId","requestKey",status,"payloadHmac","actorUserId") VALUES ($1,$2,$3,$4,$5,$6)',[store,data.customerId,randomUUID(),"PREPARED","v1:"+"a".repeat(64),actor.userId])).rejects.toMatchObject({code:"23505"});
      await c.query(`SET ROLE "${restrictedRole}"`);const result=await c.query('SELECT count(*)::int count FROM "CoursePurchaseIntent"');expect(result.rows[0].count).toBe(0);await c.query("RESET ROLE");
    }finally{await c.query("RESET ROLE");c.release()}
    await transaction(tx=>cancelCourseIntent(tx,actor,data.customerId,data.requestKey));
  });
  it("changed payment payload or missing/rotated key cannot bypass, but cancellation remains possible",async()=>{
    const data=input(randomUUID(),{customerId:"qa-rotation",paymentMethod:"BANK_TRANSFER",transferLastFour:"1234"});await transaction(tx=>prepareCourseIntent(tx,actor,data));
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,{...data,transferLastFour:"9999"}))).rejects.toThrow("不同");
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,{...data,expectedListPrice:2000}))).rejects.toThrow("不同");
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,{...data,musicPurchaseTerms:2}))).rejects.toThrow("不同");
    vi.stubEnv("AUTH_SECRET","rotated-synthetic-secret");await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,data))).rejects.toThrow("不同");
    vi.stubEnv("AUTH_SECRET","");vi.stubEnv("NEXTAUTH_SECRET","");await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,data))).rejects.toThrow("尚未設定");
    expect((await transaction(tx=>cancelCourseIntent(tx,actor,data.customerId,data.requestKey))).status).toBe("CANCELLED");vi.stubEnv("AUTH_SECRET","synthetic-test-secret-which-is-long-enough");
  });
  it("old clients without prepared intent are rejected before checkout",async()=>{
    await expect(transaction(tx=>assertCourseIntentForCheckout(tx,store,input()))).rejects.toThrow("先建立購買確認");
  });
  it("a legacy pending transaction is never reported as committed or safely cancelled",async()=>{
    const key=randomUUID();await transaction(async(_tx,c)=>{await c.query('INSERT INTO "CoursePurchase" (id,"storeId","requestKey","customerId",payload) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),store,key,customer,JSON.stringify({status:"PENDING"})])});
    expect(await transaction(tx=>readCourseIntent(tx,store,customer,key))).toBeNull();
    await expect(transaction(tx=>cancelCourseIntent(tx,actor,customer,key))).rejects.toThrow("既有交易狀態需先核對");
    await expect(transaction(tx=>acknowledgeCourseIntent(tx,actor,customer,key))).rejects.toThrow("無法核對");
  });
  it("two concurrent submissions of one key call the real checkout service but create one purchase and card",async()=>{
    const data=input(randomUUID(),{customerId:"qa-real-checkout",expectedListPrice:0});
    await transaction(tx=>prepareCourseIntent(tx,actor,data));
    const buy=()=>transaction(async tx=>{await assertCourseIntentForCheckout(tx,store,data);const order=await assignCourseWithCheckout(tx,{...actor,music:false},data);await commitCourseIntent(tx,store,data,order.id);return order.id});
    const result=await Promise.all([buy(),buy()]);expect(result[0]).toBe(result[1]);
    const c=await pool.connect();try{await c.query(`SET search_path TO "${schema}"`);const purchases=await c.query('SELECT count(*)::int count FROM "CoursePurchase" WHERE "storeId"=$1 AND "requestKey"=$2',[store,data.requestKey]);const cards=await c.query('SELECT count(*)::int count FROM "CoursePointCard" WHERE "storeId"=$1 AND "requestKey"=$2',[store,data.requestKey]);expect(purchases.rows[0].count).toBe(1);expect(cards.rows[0].count).toBe(1);}finally{c.release()}
    const outcomes=await Promise.all([transaction(tx=>acknowledgeCourseIntent(tx,actor,data.customerId,data.requestKey)),transaction(tx=>cancelCourseIntent(tx,actor,data.customerId,data.requestKey))]);
    expect(outcomes.map(x=>x.status)).toEqual(["COMMITTED","COMMITTED"]);expect(await transaction(tx=>readPendingCourseIntent(tx,store,data.customerId))).toBeNull();
  });
  it("six explicitly acknowledged purchases remain possible for the same learner",async()=>{
    for(let i=0;i<6;i++){
      const data=input(randomUUID(),{customerId:"qa-six",expectedListPrice:0});await transaction(tx=>prepareCourseIntent(tx,actor,data));
      await transaction(async tx=>{await assertCourseIntentForCheckout(tx,store,data);const order=await assignCourseWithCheckout(tx,{...actor,music:false},data);await commitCourseIntent(tx,store,data,order.id)});
      await transaction(tx=>acknowledgeCourseIntent(tx,actor,data.customerId,data.requestKey));
    }
    const c=await pool.connect();try{await c.query(`SET search_path TO "${schema}"`);const rows=await c.query('SELECT count(*)::int count FROM "CoursePurchase" WHERE "storeId"=$1 AND "customerId"=$2',[store,"qa-six"]);const cards=await c.query('SELECT count(*)::int count FROM "CoursePointCard" WHERE "storeId"=$1 AND "customerId"=$2',[store,"qa-six"]);expect(rows.rows[0].count).toBe(6);expect(cards.rows[0].count).toBe(6);}finally{c.release()}
  });
});
