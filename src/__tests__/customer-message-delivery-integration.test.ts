import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {toLocalDateStr} from "@/lib/date-utils";

// In-memory PostgreSQL + a small ORM adapter. Real actions, outbox worker,
// recipient resolver, quota reader and LINE transport run below.
// Every HTTP request is intercepted; there are no real tokens or external sends.
const state=vi.hoisted(()=>({
  db:{} as Record<string,unknown>,
  paused:false,preview:false,permitted:true,feature:true,planLimit:100,
  botMatches:true,profileStatus:200,timeoutOnce:false,
  after:[] as Array<()=>Promise<void>>,
  requests:[] as Array<{to:string;messages:unknown[];key:string}>,
  accepted:new Set<string>(),
}));
vi.mock("@/lib/db",()=>({prisma:new Proxy({},{get:(_,key)=>state.db[key as string]})}));
vi.mock("next/server",async importOriginal=>({...await importOriginal<typeof import("next/server")>(),after:(fn:()=>Promise<void>)=>state.after.push(fn)}));
vi.mock("@/lib/permissions",()=>({
  requirePermission:async()=>({id:"test-manager",role:"MANAGER",staffId:"test-staff",storeId:"test-store"}),
  checkPermission:async()=>state.permitted,
}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:async()=>"test-store"}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:async()=>state.feature,requireStoreFeature:async()=>{if(!state.feature)throw new Error("功能未開通");}}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:async()=>{}}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:async()=>({})}));
vi.mock("@/lib/reminder-send-limit",()=>({checkReminderSendLimit:(_store:unknown,count:number)=>({allowed:count<state.planLimit,current:count,limit:state.planLimit})}));
vi.mock("@/lib/line-delivery-pause",()=>({isSystemLineDeliveryPaused:()=>state.paused,isLineDeliveryEventCurrent:()=>true}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:()=>state.preview}));
vi.mock("@/lib/store-line-config",()=>({getConfiguredStoreLine:()=>null,storeLineIdentityProvider:()=>"line"}));
vi.mock("@/lib/line-config",()=>({
  getLineConfigForStore:()=>({accessToken:"isolated-no-real-line-token",expectedBasicId:"@isolated-test"}),
  getLineAccessTokenForStore:(storeId:string)=>{if(storeId!=="test-store")throw new Error("Unexpected store");return "isolated-no-real-line-token";},
  getSteamButlerLineAccessToken:()=>{throw new Error("Central fallback forbidden");},
  getLineSecretForStore:()=>null,getSteamButlerLineSecret:()=>null,
  LINE_SECRET_NOT_CONFIGURED_ERROR:"not configured",LINE_TOKEN_NOT_CONFIGURED_ERROR:"not configured",
}));
vi.mock("@/server/services/customer-label-filter",()=>({customerLabelFilterIds:async()=>null}));
vi.mock("@/server/services/music-data-scope",()=>({musicCustomerWhere:()=>({})}));

import {previewMessage,confirmMessage,cancelMessage,loadMessageHistory} from "@/server/actions/customer-messages";
import {GET as runCron} from "@/app/api/cron/customer-messages/route";

let pg:PGlite;
type Person={id:string;name:string;lineUserId:string|null;lineLinkStatus:string};
type LogData={id:string;storeId:string;customerId:string;renderedBody:string;status:string;lineRoute:string};
type LogUpdate={status:string;errorMessage:string|null;sentAt:Date|null};
function statement(strings:TemplateStringsArray){
  return strings.reduce((sql,part,i)=>sql+(i?"$"+i:"")+part,"");
}
async function raw(strings:TemplateStringsArray,...values:unknown[]){return (await pg.query(statement(strings),values)).rows;}
async function execute(strings:TemplateStringsArray,...values:unknown[]){return (await pg.query(statement(strings),values)).affectedRows;}
const recipient="U"+"1".repeat(32);
const body="【隔離測試】\n今天請從側門進入。\nhttps://example.com/booking";
const draft=()=>({customerIds:["test-customer"],body,timing:"now"});
async function flushAfter(){for(const work of state.after.splice(0))await work();}
async function cron(){
  const response=await runCron(new NextRequest("http://localhost/api/cron/customer-messages",{headers:{authorization:"Bearer isolated-cron-secret"}}));
  expect(response.status).toBe(200);
  return response.json();
}
async function queue(input:unknown=draft()){
  const preview=await previewMessage("test-store",input);
  if(!preview.success)throw new Error(preview.error);
  const confirmation=await confirmMessage("test-store",preview.data.id);
  expect(confirmation.success).toBe(true);
  return preview.data;
}
beforeAll(async()=>{
  pg=new PGlite();
  await pg.exec('CREATE TABLE "Store"(id text primary key,"isDemo" boolean default false,"archivedAt" timestamp,"operatingStatus" text default \'ACTIVE\'); CREATE TABLE "User"(id text primary key,role text,status text); CREATE TABLE "Staff"(id text primary key,"userId" text,"storeId" text,status text); CREATE TABLE "Customer"(id text primary key,"storeId" text,name text,"lineUserId" text,"lineLinkStatus" text,"mergedIntoCustomerId" text); CREATE TABLE "MessageLog"(id text primary key,"storeId" text,"customerId" text,"renderedBody" text,status text,"lineRoute" text,"errorMessage" text,"sentAt" timestamp,"createdAt" timestamp default CURRENT_TIMESTAMP);');
  await pg.exec(readFileSync("prisma/migrations/20261117090000_customer_messages/migration.sql","utf8"));
  state.db.$queryRaw=raw;state.db.$executeRaw=execute;
  state.db.$transaction=async(fn:(db:typeof state.db)=>Promise<unknown>)=>{
    await pg.exec("BEGIN");try{const result=await fn(state.db);await pg.exec("COMMIT");return result;}catch(e){await pg.exec("ROLLBACK");throw e;}
  };
  state.db.customer={findFirst:async(arg:{where:{AND:Array<{id:string;storeId:string}>}})=>{
    const {id,storeId}=arg.where.AND[0];
    const result=await pg.query<Person>('SELECT id,name,"lineUserId","lineLinkStatus" FROM "Customer" WHERE id=$1 AND "storeId"=$2 AND "mergedIntoCustomerId" IS NULL',[id,storeId]);
    return result.rows[0]?{...result.rows[0],user:null}:null;
  }};
  state.db.store={findFirst:async(arg:{where:{id:string}})=>{
    const result=await pg.query<{id:string}>('SELECT id FROM "Store" WHERE id=$1 AND NOT "isDemo" AND "archivedAt" IS NULL AND "operatingStatus" IN (\'ACTIVE\',\'TRIAL\')',[arg.where.id]);
    return result.rows[0]??null;
  }};
  state.db.user={findFirst:async(arg:{where:{id:string}})=>{
    const result=await pg.query<{role:string;staffId:string;storeId:string;staffStatus:string}>('SELECT u.role,s.id AS "staffId",s."storeId",s.status AS "staffStatus" FROM "User" u LEFT JOIN "Staff" s ON s."userId"=u.id WHERE u.id=$1 AND u.status=\'ACTIVE\'',[arg.where.id]);
    const row=result.rows[0];return row?{role:row.role,staff:{id:row.staffId,storeId:row.storeId,status:row.staffStatus}}:null;
  }};
  state.db.messageLog={
    findUnique:async(arg:{where:{id:string}})=>(await pg.query<{status:string}>('SELECT status FROM "MessageLog" WHERE id=$1',[arg.where.id])).rows[0]??null,
    count:async(arg:{where:{storeId:string}})=>Number((await pg.query<{count:number}>('SELECT count(*)::int AS count FROM "MessageLog" WHERE "storeId"=$1 AND status IN (\'SENT\',\'PENDING\')',[arg.where.storeId])).rows[0].count),
    create:async({data:d}:{data:LogData})=>{await pg.query('INSERT INTO "MessageLog"(id,"storeId","customerId","renderedBody",status,"lineRoute") VALUES ($1,$2,$3,$4,$5,$6)',[d.id,d.storeId,d.customerId,d.renderedBody,d.status,d.lineRoute]);return d;},
    updateMany:async({where,data}:{where:{id:string;storeId:string};data:LogUpdate})=>({count:(await pg.query('UPDATE "MessageLog" SET status=$1,"errorMessage"=$2,"sentAt"=$3 WHERE id=$4 AND "storeId"=$5',[data.status,data.errorMessage,data.sentAt,where.id,where.storeId])).affectedRows}),
  };
});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{
  state.paused=false;state.preview=false;state.permitted=true;state.feature=true;state.planLimit=100;state.botMatches=true;state.profileStatus=200;state.timeoutOnce=false;state.after=[];state.requests=[];state.accepted.clear();
  await pg.exec('TRUNCATE "CustomerMessageRecipient","CustomerMessageBatch","MessageLog","Customer","Staff","User","Store" CASCADE; INSERT INTO "Store"(id) VALUES (\'test-store\'); INSERT INTO "User" VALUES (\'test-manager\',\'MANAGER\',\'ACTIVE\'); INSERT INTO "Staff" VALUES (\'test-staff\',\'test-manager\',\'test-store\',\'ACTIVE\');');
  await pg.query('INSERT INTO "Customer"(id,"storeId",name,"lineUserId","lineLinkStatus") VALUES ($1,$2,$3,$4,$5)',["test-customer","test-store","隔離測試顧客",recipient,"LINKED"]);
  vi.stubEnv("CRON_SECRET","isolated-cron-secret");
  vi.stubGlobal("fetch",vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(!url.startsWith("https://api.line.me/v2/bot/"))throw new Error("Unexpected HTTP request");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer isolated-no-real-line-token");
    if(url.endsWith("/info"))return Response.json({displayName:"隔離測試 LINE",basicId:state.botMatches?"@isolated-test":"@wrong-account",userId:"U"+"3".repeat(32)});
    if(url.includes("/profile/"))return Response.json({}, {status:state.profileStatus});
    if(url.endsWith("/message/quota"))return Response.json({type:"limited",value:1000});
    if(url.endsWith("/message/quota/consumption"))return Response.json({totalUsage:state.accepted.size});
    if(url.endsWith("/message/push")){
      expect(init?.method).toBe("POST");
      const payload=JSON.parse(String(init?.body)) as {to:string;messages:unknown[]};
      const key=new Headers(init?.headers).get("x-line-retry-key")??"";
      expect(payload.to).toBe(recipient);expect(key).toMatch(/^[a-f0-9-]{36}$/);
      state.requests.push({...payload,key});
      if(state.accepted.has(key))return Response.json({}, {status:409,headers:{"x-line-accepted-request-id":"isolated-accepted"}});
      state.accepted.add(key);
      if(state.timeoutOnce){state.timeoutOnce=false;throw new Error("Response lost after simulated acceptance");}
      return Response.json({});
    }
    throw new Error("Unexpected LINE endpoint");
  }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("real action → PostgreSQL outbox → real worker → intercepted LINE request",()=>{
  it("sends only the selected recipient and preserves the preview payload",async()=>{
    const preview=await queue();expect(state.requests).toHaveLength(0);
    const saved=(await pg.query<{payload:unknown[]}>('SELECT payload FROM "CustomerMessageBatch" WHERE id=$1',[preview.id])).rows[0].payload;
    await flushAfter();
    expect(state.requests).toHaveLength(1);expect(state.requests[0].messages).toEqual(saved);
    expect(JSON.stringify(saved)).toContain("今天請從側門進入");
    expect(JSON.stringify(saved)).toContain("https://example.com/booking");
    const history=await loadMessageHistory("test-store");
    expect(history.success&&history.data[0]).toMatchObject({accepted:1,pending:0,status:"COMPLETED"});
    await confirmMessage("test-store",preview.id);await flushAfter();await cron();
    expect(state.requests).toHaveLength(1);
  });
  it("does not send scheduled messages early and dispatches only after due time",async()=>{
    const preview=await queue({...draft(),timing:"scheduled",date:toLocalDateStr(new Date(Date.now()+86400000)),time:"10:15"});
    expect(preview.scheduledAt).toContain("T02:15:");
    await flushAfter();expect((await cron()).processed).toBe(0);expect(state.requests).toHaveLength(0);
    await pg.query('UPDATE "CustomerMessageBatch" SET "scheduledAt"=NOW()-interval \'1 second\' WHERE id=$1',[preview.id]);
    expect((await cron()).processed).toBe(1);expect(state.requests).toHaveLength(1);
  });
  it("cancels a confirmed message before any LINE push",async()=>{
    const preview=await queue();expect((await cancelMessage("test-store",preview.id)).success).toBe(true);
    await flushAfter();await cron();expect(state.requests).toHaveLength(0);
  });
  it("reconciles ambiguous HTTP responses with the original payload and retry key",async()=>{
    const preview=await queue();state.timeoutOnce=true;await flushAfter();
    const pending=await loadMessageHistory("test-store");expect(pending.success&&pending.data[0]).toMatchObject({accepted:0,pending:1});
    await pg.query('UPDATE "CustomerMessageRecipient" SET "nextAttemptAt"=NOW()-interval \'1 second\' WHERE "batchId"=$1',[preview.id]);
    await cron();expect(state.requests).toHaveLength(2);expect(state.requests[1]).toEqual(state.requests[0]);expect(state.accepted.size).toBe(1);
    const done=await loadMessageHistory("test-store");expect(done.success&&done.data[0]).toMatchObject({accepted:1,pending:0});
  });
  it("stops when the recipient identity changes after confirmation",async()=>{
    await queue();await pg.query('UPDATE "Customer" SET "lineUserId"=$1 WHERE id=$2',["U"+"2".repeat(32),"test-customer"]);
    await flushAfter();expect(state.requests).toHaveLength(0);
    expect((await pg.query<{status:string}>('SELECT status FROM "CustomerMessageRecipient"')).rows[0].status).toBe("SKIPPED");
  });
  it("keeps demo stores and mismatched official accounts from sending",async()=>{
    await queue();await pg.exec('UPDATE "Store" SET "isDemo"=true');await flushAfter();expect(state.requests).toHaveLength(0);
    await pg.exec('UPDATE "Store" SET "isDemo"=false');state.botMatches=false;await queue();await flushAfter();expect(state.requests).toHaveLength(0);
  });
  it("honors pause and Preview isolation even after a message has been confirmed",async()=>{
    await queue();state.paused=true;await flushAfter();expect((await cron()).paused).toBe(true);expect(state.requests).toHaveLength(0);
    state.paused=false;state.preview=true;expect((await cron()).paused).toBe(true);expect(state.requests).toHaveLength(0);
  });
  it("does not send after permissions are revoked or the plan allowance is exhausted",async()=>{
    await queue();state.permitted=false;await flushAfter();expect(state.requests).toHaveLength(0);
    state.permitted=true;state.planLimit=0;await queue();await flushAfter();expect(state.requests).toHaveLength(0);
  });
  it("excludes an unlinked customer before confirmation",async()=>{
    await pg.exec('UPDATE "Customer" SET "lineUserId"=NULL,"lineLinkStatus"=\'UNLINKED\'');
    const result=await previewMessage("test-store",draft());expect(result.success&&result.data.ready).toEqual([]);
    if(!result.success)throw new Error(result.error);
    expect((await confirmMessage("test-store",result.data.id)).success).toBe(false);
    await flushAfter();expect(state.requests).toHaveLength(0);
  });
});
