import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
const m=vi.hoisted(()=>({db:{} as Record<string,unknown>,blocked:vi.fn(),feature:vi.fn(),quota:vi.fn(),push:vi.fn(),centralPush:vi.fn(),route:vi.fn(),central:vi.fn(),config:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:new Proxy({}, {get:(_t,key)=>m.db[String(key)]})}));
vi.mock("@/lib/beauty-db",()=>({beautyPrisma:new Proxy({}, {get:(_t,key)=>m.db[String(key)]})}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:m.blocked}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/line",()=>({pushMessage:m.push,pushSteamButlerMessage:m.centralPush}));
vi.mock("@/lib/store-line-config",()=>({getConfiguredStoreLine:m.config}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:vi.fn(async()=>({plan:"PROFESSIONAL"}))}));
vi.mock("@/lib/reminder-send-limit",()=>({checkReminderSendLimit:m.quota}));
vi.mock("@/server/services/central-line-recipient-loader",()=>({resolveCentralLineRecipientForCustomer:m.central}));
vi.mock("@/server/services/verified-reminder-line-route",()=>({resolveVerifiedReminderLineRoute:m.route}));
import {enqueuePlanActivation} from "@/server/services/plan-activation-enqueue";
import {runPlanActivationNotifications} from "@/server/services/plan-activation-notifications";
import {planActivationSettingId} from "@/lib/plan-activation-notification";

const pg=new PGlite();
const raw=(parts:TemplateStringsArray,...values:unknown[])=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:""),""),values);
const $queryRaw=async(parts:TemplateStringsArray,...values:unknown[])=>(await raw(parts,...values)).rows;
const $executeRaw=async(parts:TemplateStringsArray,...values:unknown[])=>(await raw(parts,...values)).affectedRows??0;
const event={storeId:"s",customerId:"buyer",module:"STEAMFOOT" as const,sourceId:"sale",entitlementId:"wallet",planName:"十堂方案",quantity:10,unit:"堂",expiresDate:"2027-01-31"};
const tx={$queryRaw,$executeRaw};
const first=async()=> (await pg.query<Record<string,unknown>>('SELECT * FROM "PlanActivationNotification" LIMIT 1')).rows[0];
const logs=async()=> (await pg.query<{status:string;renderedBody:string;errorMessage:string}>('SELECT * FROM "MessageLog"')).rows;
const due=()=>pg.exec('UPDATE "PlanActivationNotification" SET "nextAttemptAt"=NOW()-interval \'1 minute\'');
async function queue(module:"STEAMFOOT"|"COURSE"|"BEAUTY"="STEAMFOOT") {
  await enqueuePlanActivation(tx as Parameters<typeof enqueuePlanActivation>[0],{...event,module});
}

beforeAll(async()=>{
  await pg.exec('CREATE ROLE steamfoot_beauty_data_activationqa');
  await pg.exec(`
    CREATE TABLE "Store" (id text PRIMARY KEY,name text,"industryModule" text);
    CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,name text,"mergedIntoCustomerId" text,"lineUserId" text,"lineLinkStatus" text);
    CREATE TABLE "MessageTemplate" (id text PRIMARY KEY,"storeId" text,body text);
    CREATE TABLE "MessageLog" (id text PRIMARY KEY,status text,"renderedBody" text,"errorMessage" text);
    CREATE TABLE "Transaction" (id text,"storeId" text,"customerId" text,"customerPlanWalletId" text,status text,"paymentStatus" text,"refundAmount" integer);
    CREATE TABLE "CustomerPlanWallet" (id text,"storeId" text,status text);
    CREATE TABLE "CoursePurchase" (id text,"storeId" text,"customerId" text,"cardId" text,status text,"voidedAt" timestamp);
    CREATE TABLE "CoursePointCard" (id text,"storeId" text,"closedAt" timestamp);
    CREATE TABLE "BeautyCard" (id text,"storeId" text,"customerId" text,"closedAt" timestamp);
    CREATE TABLE "BeautyPayment" (id text,"storeId" text,"cardId" text,kind text,"originalPaymentId" text);
    CREATE TABLE "BeautyTransactionRevision" ("storeId" text,"transactionId" text,"voidedAt" timestamp);
  `);
  await pg.exec(readFileSync("prisma/migrations/20261025160000_plan_activation_notification/migration.sql","utf8"));
  const db={
    ...tx,
    $transaction:async(cb:(value:unknown)=>unknown)=>cb(m.db),
    store:{findFirst:async({where}:{where:{id:string;industryModule:string}})=>(await pg.query('SELECT id FROM "Store" WHERE id=$1 AND "industryModule"=$2',[where.id,where.industryModule])).rows[0]??null},
    customer:{findFirst:async({where}:{where:{id:string;storeId:string}})=>(await pg.query('SELECT * FROM "Customer" WHERE id=$1 AND "storeId"=$2 AND "mergedIntoCustomerId" IS NULL AND "lineLinkStatus"<>\'BLOCKED\'',[where.id,where.storeId])).rows[0]??null},
    messageTemplate:{
      findUnique:async({where}:{where:{id:string}})=>(await pg.query('SELECT body FROM "MessageTemplate" WHERE id=$1',[where.id])).rows[0]??null,
      upsert:async({create}:{create:{id:string;storeId:string;body:string}})=>pg.query('INSERT INTO "MessageTemplate" VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[create.id,create.storeId,create.body]),
    },
    messageLog:{
      count:vi.fn(async()=>0),
      findUnique:async({where}:{where:{id:string}})=>(await pg.query('SELECT status FROM "MessageLog" WHERE id=$1',[where.id])).rows[0]??null,
      upsert:async({create,update}:{create:{id:string;status:string;renderedBody:string;errorMessage:string|null};update:{status:string;errorMessage:string|null}})=>pg.query('INSERT INTO "MessageLog" VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET status=$5,"errorMessage"=$6',[create.id,create.status,create.renderedBody,create.errorMessage,update.status,update.errorMessage]),
    },
  };
  m.db=db;
});
afterAll(()=>pg.close());
beforeEach(async()=>{
  vi.clearAllMocks();
  vi.stubEnv("BEAUTY_MODULE_ENABLED","1");vi.stubEnv("BEAUTY_NOTIFICATIONS_ENABLED","1");
  m.blocked.mockReturnValue(false);m.feature.mockResolvedValue(true);m.quota.mockReturnValue({allowed:true});
  m.push.mockResolvedValue({success:true});m.centralPush.mockResolvedValue({success:true});
  m.route.mockResolvedValue({status:"READY",channel:"STORE",recipientLineUserId:"line-buyer"});m.config.mockReturnValue({destination:"channel-s"});
  await pg.exec(`TRUNCATE "Store","Customer","MessageTemplate","MessageLog","Transaction","CustomerPlanWallet","CoursePurchase","CoursePointCard","BeautyCard","BeautyPayment","BeautyTransactionRevision","PlanActivationNotification";
    INSERT INTO "Store" VALUES ('s','測試館','STEAMFOOT');
    INSERT INTO "Customer" VALUES ('buyer','s','學員甲',NULL,'line-buyer','LINKED');
    INSERT INTO "Transaction" VALUES ('sale','s','buyer','wallet','SUCCESS','CONFIRMED',0);
    INSERT INTO "CustomerPlanWallet" VALUES ('wallet','s','ACTIVE');
    INSERT INTO "CoursePurchase" VALUES ('sale','s','buyer','wallet','CONFIRMED',NULL);
    INSERT INTO "CoursePointCard" VALUES ('wallet','s',NULL);
    INSERT INTO "BeautyCard" VALUES ('wallet','s','buyer',NULL);
    INSERT INTO "BeautyPayment" VALUES ('sale','s','wallet','SALE',NULL);`);
  await pg.query('INSERT INTO "MessageTemplate" VALUES ($1,\'s\',\'enabled\')',[planActivationSettingId("s")]);
});

describe("transactional activation outbox",()=>{
  it("restricts dedicated Beauty roles to Beauty outbox rows",async()=>{
    await queue();await queue("BEAUTY");
    try {
      await pg.exec('SET ROLE steamfoot_beauty_data_activationqa');
      expect((await pg.query<{module:string}>('SELECT module FROM "PlanActivationNotification"')).rows.map(row=>row.module)).toEqual(["BEAUTY"]);
      expect((await pg.query('UPDATE "PlanActivationNotification" SET status=\'SENT\' WHERE module=\'STEAMFOOT\'')).affectedRows).toBe(0);
      await expect(pg.exec('DELETE FROM "PlanActivationNotification"')).rejects.toThrow();
    } finally {await pg.exec('RESET ROLE');}
  });
  it("deduplicates the same entitlement and rolls back with a failed purchase",async()=>{
    await queue();await queue();expect((await pg.query('SELECT * FROM "PlanActivationNotification"')).rows).toHaveLength(1);
    await pg.exec('BEGIN');await enqueuePlanActivation(tx as Parameters<typeof enqueuePlanActivation>[0],{...event,entitlementId:"rolled-back"});await pg.exec('ROLLBACK');
    expect((await pg.query('SELECT * FROM "PlanActivationNotification"')).rows).toHaveLength(1);
  });
  it.each(["STEAMFOOT","COURSE","BEAUTY"] as const)("sends only the %s purchaser and records the actual result",async module=>{
    await pg.query('UPDATE "Store" SET "industryModule"=$1',[module]);await queue(module);
    await runPlanActivationNotifications("s",module==="BEAUTY");await runPlanActivationNotifications("s",module==="BEAUTY");
    expect(m.push).toHaveBeenCalledTimes(1);expect(m.push.mock.calls[0][0]).toBe("s");expect(m.push.mock.calls[0][1]).toBe("line-buyer");
    expect(m.push.mock.calls[0][2][0].text).toContain("十堂方案");expect(m.push.mock.calls[0][2][0].text).toContain("10 堂");
    expect((await logs())[0].status).toBe("SENT");expect((await first()).status).toBe("SENT");
  });
  it("never backfills purchases opened with the switch off",async()=>{
    await pg.exec('UPDATE "MessageTemplate" SET body=\'disabled\'');await queue();
    await pg.exec('UPDATE "MessageTemplate" SET body=\'enabled\'');await runPlanActivationNotifications("s");
    expect(m.push).not.toHaveBeenCalled();expect((await logs())[0].status).toBe("SKIPPED");
  });
  it("leases an event once across concurrent workers",async()=>{
    await queue();await Promise.all([runPlanActivationNotifications("s"),runPlanActivationNotifications("s")]);expect(m.push).toHaveBeenCalledTimes(1);
  });
  it("retains the exact recipient, body and retry key after an uncertain send",async()=>{
    await queue();m.push.mockResolvedValueOnce({success:false,error:"timeout"});await runPlanActivationNotifications("s");
    expect((await logs())[0].status).toBe("PENDING");await due();await runPlanActivationNotifications("s");
    expect(m.push.mock.calls[1]).toEqual(m.push.mock.calls[0]);expect((await logs())[0].status).toBe("SENT");
  });
  it("does not revive an event switched off while LINE was in flight",async()=>{
    await queue();m.push.mockImplementationOnce(async()=>{
      await pg.exec('UPDATE "PlanActivationNotification" SET status=\'SKIPPED\',"errorMessage"=\'通知已關閉\'');
      return {success:false,error:"timeout"};
    });
    await runPlanActivationNotifications("s");await due();await runPlanActivationNotifications("s");
    expect(m.push).toHaveBeenCalledTimes(1);expect((await first()).status).toBe("SKIPPED");
  });
  it("never reroutes an uncertain send to a different identity",async()=>{
    await queue();m.push.mockResolvedValueOnce({success:false,error:"timeout"});await runPlanActivationNotifications("s");await due();
    m.route.mockResolvedValue({status:"READY",channel:"STORE",recipientLineUserId:"someone-else"});await runPlanActivationNotifications("s");
    expect(m.push).toHaveBeenCalledTimes(1);expect((await first()).status).toBe("SKIPPED");expect((await logs())[0].status).toBe("PENDING");
  });
  it.each(["refund","off","preview","quota","identity","feature","foreign-store","blocked","stale"])("skips %s without sending",async why=>{
    await queue();
    if(why==="refund")await pg.exec('UPDATE "Transaction" SET "refundAmount"=1');
    if(why==="off")await pg.exec('UPDATE "MessageTemplate" SET body=\'disabled\'');
    if(why==="preview")m.blocked.mockReturnValue(true);
    if(why==="quota")m.quota.mockReturnValue({allowed:false});
    if(why==="identity")m.route.mockResolvedValue({status:"BLOCKED",reason:"IDENTITY_UNCONFIRMED"});
    if(why==="feature")m.feature.mockResolvedValue(false);
    if(why==="foreign-store")await pg.exec('UPDATE "Transaction" SET "storeId"=\'elsewhere\'');
    if(why==="blocked")await pg.exec('UPDATE "Customer" SET "lineLinkStatus"=\'BLOCKED\'');
    if(why==="stale")await pg.exec('UPDATE "PlanActivationNotification" SET "createdAt"=NOW()-interval \'24 hours\'');
    await runPlanActivationNotifications("s");expect(m.push).not.toHaveBeenCalled();expect((await first()).status).toBe("SKIPPED");
  });
  it("recovers a successful log if the outbox status update was interrupted",async()=>{
    await queue();await runPlanActivationNotifications("s");await pg.exec('UPDATE "PlanActivationNotification" SET status=\'FAILED\'');await due();
    await runPlanActivationNotifications("s");expect(m.push).toHaveBeenCalledTimes(1);expect((await logs())[0].status).toBe("SENT");expect((await first()).status).toBe("SENT");
  });
  it("captures Preview/off-period eligibility when issuing the plan",async()=>{
    m.blocked.mockReturnValue(true);await queue();m.blocked.mockReturnValue(false);await runPlanActivationNotifications("s");expect(m.push).not.toHaveBeenCalled();
  });
});
