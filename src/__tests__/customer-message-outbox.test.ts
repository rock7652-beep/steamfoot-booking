import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from "vitest";
const state=vi.hoisted(()=>({db:{} as Record<string,unknown>,paused:false,blocked:false,quota:{used:0,limit:1000},people:new Map<string,{id:string;name:string;lineUserId:string|null;lineLinkStatus:string;user:null}>()}));
vi.mock("@/lib/db",()=>({prisma:new Proxy({},{get:(_,key)=>state.db[key as string]})}));
vi.mock("@/lib/store-line-config",()=>({getConfiguredStoreLine:()=>null,storeLineIdentityProvider:()=>"line"}));
vi.mock("@/lib/line-config",()=>({getLineConfigForStore:()=>({accessToken:"test-only",expectedBasicId:"@test"})}));
vi.mock("@/lib/line-delivery-pause",()=>({isSystemLineDeliveryPaused:()=>state.paused,isLineDeliveryEventCurrent:()=>true}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:()=>state.blocked}));
vi.mock("@/lib/line-quota",()=>({readLineQuota:async()=>state.quota}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:async()=>true}));
vi.mock("@/server/services/customer-label-filter",()=>({customerLabelFilterIds:async()=>null}));
vi.mock("@/server/services/music-data-scope",()=>({musicCustomerWhere:()=>({})}));
vi.mock("@/lib/line",()=>({pushMessage:vi.fn(),getLineBotInfo:vi.fn()}));
vi.mock("@/lib/permissions",()=>({checkPermission:async()=>true}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:async()=>{}}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:async()=>({})}));
vi.mock("@/lib/reminder-send-limit",()=>({checkReminderSendLimit:()=>({allowed:true})}));
vi.mock("@/server/services/verified-reminder-line-route",()=>({resolveVerifiedReminderLineRoute:vi.fn()}));
import { previewCustomerMessage,confirmCustomerMessage,cancelCustomerMessage,customerMessageHistory } from "@/server/services/customer-messages";
import { claimCustomerMessage,processCustomerMessage,finishCustomerMessage,type CustomerMessageWorkerDeps } from "@/server/services/customer-message-worker";
let pg:PGlite;
function sql(strings:TemplateStringsArray,...values:unknown[]){return {text:strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values};}
async function query(strings:TemplateStringsArray,...values:unknown[]){const q=sql(strings,...values);return (await pg.query(q.text,q.values)).rows;}
async function execute(strings:TemplateStringsArray,...values:unknown[]){const q=sql(strings,...values);return (await pg.query(q.text,q.values)).affectedRows;}
beforeAll(async()=>{
 pg=new PGlite();await pg.exec('CREATE TABLE "Store"(id text primary key);CREATE TABLE "User"(id text primary key);CREATE TABLE "MessageLog"(id text primary key,"storeId" text,status text,"errorMessage" text,"sentAt" timestamp);');
 await pg.exec(readFileSync('prisma/migrations/20261117090000_customer_messages/migration.sql','utf8'));
 state.db.$queryRaw=query;state.db.$executeRaw=execute;state.db.$transaction=async(fn:(db:typeof state.db)=>Promise<unknown>)=>{await pg.exec('BEGIN');try{const r=await fn(state.db);await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}};
 state.db.customer={findFirst:vi.fn(async(arg:{where:{AND:Array<{id?:string;storeId?:string}>}})=>arg.where.AND[0].storeId==='shop-a'?state.people.get(arg.where.AND[0].id??'')??null:null)};
 state.db.messageLog={updateMany:vi.fn(async()=>({count:0}))};
});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('TRUNCATE "CustomerMessageRecipient","CustomerMessageBatch","Store","User" CASCADE;INSERT INTO "Store" VALUES (\'shop-a\'),(\'shop-b\');INSERT INTO "User" VALUES (\'manager-a\'),(\'manager-b\');');state.paused=false;state.blocked=false;state.quota={used:0,limit:1000};state.people.clear();state.people.set('one',{id:'one',name:'王小美',lineUserId:'Uone',lineLinkStatus:'LINKED',user:null});state.people.set('two',{id:'two',name:'李小華',lineUserId:null,lineLinkStatus:'UNLINKED',user:null});});
const draft=()=>({customerIds:['one','two'],body:'今天請從側門進入\n謝謝您！',timing:'now'});
async function queued(){const p=await previewCustomerMessage('shop-a','manager-a',draft());await confirmCustomerMessage('shop-a','manager-a',p.id);return p;}
describe('manual LINE durable outbox with real PostgreSQL semantics',()=>{
 it('history returns the original recipient names and individual results only within the authorized store',async()=>{
   await queued();state.people.get('one')!.name='後來改名';
   const history=await customerMessageHistory('shop-a');
   expect(history[0].recipients).toEqual(expect.arrayContaining([
     expect.objectContaining({name:'王小美',status:'PENDING',reason:null}),
     expect.objectContaining({name:'李小華',status:'SKIPPED',reason:expect.any(String)}),
   ]));
   expect(history[0].recipients).toHaveLength(2);
   expect(Object.keys(history[0].recipients[0]).sort()).toEqual(['id','name','reason','status']);
   expect(await customerMessageHistory('shop-b')).toEqual([]);
 });
 it('preview excludes unreachable people and never makes a job deliverable',async()=>{const p=await previewCustomerMessage('shop-a','manager-a',draft());expect(p.ready.map(p=>p.id)).toEqual(['one']);expect(p.excluded.map(p=>p.id)).toEqual(['two']);expect(await claimCustomerMessage()).toBeNull();expect(await customerMessageHistory('shop-a')).toEqual([]);});
 it('confirmation replays reuse one batch, preserve body, and cannot cross stores or users',async()=>{const p=await queued();await confirmCustomerMessage('shop-a','manager-a',p.id);expect((await pg.query('SELECT * FROM "CustomerMessageBatch"')).rows).toHaveLength(1);await expect(confirmCustomerMessage('shop-b','manager-b',p.id)).rejects.toThrow('找不到');await expect(confirmCustomerMessage('shop-a','manager-b',p.id)).rejects.toThrow('找不到');const job=await claimCustomerMessage('shop-a');expect(job?.batch.body).toBe(draft().body);expect(await claimCustomerMessage('shop-a')).toBeNull();});
 it('scheduled messages are not claimed early and previews expire',async()=>{const p=await previewCustomerMessage('shop-a','manager-a',{...draft(),timing:'scheduled',date:'2099-01-01',time:'10:00'}).catch(e=>e);expect(p).toBeInstanceOf(Error);const valid=await queued();await pg.query('UPDATE "CustomerMessageBatch" SET "scheduledAt"=NOW()+interval \'1 day\' WHERE id=$1',[valid.id]);expect(await claimCustomerMessage()).toBeNull();const expired=await previewCustomerMessage('shop-a','manager-a',draft());await pg.query('UPDATE "CustomerMessageBatch" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE id=$1',[expired.id]);await expect(confirmCustomerMessage('shop-a','manager-a',expired.id)).rejects.toThrow('過期');});
 it('honors pause, preview isolation and fresh LINE quota before enqueueing',async()=>{const p=await previewCustomerMessage('shop-a','manager-a',draft());state.paused=true;await expect(confirmCustomerMessage('shop-a','manager-a',p.id)).rejects.toThrow('暫停');state.paused=false;state.blocked=true;await expect(confirmCustomerMessage('shop-a','manager-a',p.id)).rejects.toThrow('預覽');state.blocked=false;state.quota={used:1000,limit:1000};await expect(confirmCustomerMessage('shop-a','manager-a',p.id)).rejects.toThrow('額度');expect(await claimCustomerMessage()).toBeNull();});
 it('cancellation prevents claims and does not label ambiguous attempts as unsent',async()=>{const p=await queued();await expect(cancelCustomerMessage('shop-b',p.id)).rejects.toThrow('找不到');await pg.query('UPDATE "CustomerMessageRecipient" SET "firstAttemptAt"=NOW() WHERE "batchId"=$1 AND status=\'PENDING\'',[p.id]);await cancelCustomerMessage('shop-a',p.id);expect(await claimCustomerMessage()).toBeNull();const h=await customerMessageHistory('shop-a');expect(h[0]).toMatchObject({status:'CANCELLED',unknown:1,pending:0});});
 it('expired leases reuse the same retry key; finishing accepted jobs is terminal',async()=>{await queued();const first=await claimCustomerMessage();await pg.query('UPDATE "CustomerMessageRecipient" SET "nextAttemptAt"=NOW()-interval \'1 minute\' WHERE id=$1',[first!.recipient.id]);const second=await claimCustomerMessage();expect(second!.recipient.retryKey).toBe(first!.recipient.retryKey);await finishCustomerMessage(second!,'ACCEPTED',null);expect(await claimCustomerMessage()).toBeNull();expect((await customerMessageHistory('shop-a'))[0]).toMatchObject({accepted:1,status:'PARTIAL',skipped:1});});
 it('rejects forged cross-store recipient rows at the database boundary',async()=>{const p=await queued();await expect(pg.query('INSERT INTO "CustomerMessageRecipient" (id,"batchId","storeId","customerId","nameSnapshot",status,"retryKey") VALUES ($1,$2,$3,$4,$5,$6,$7)',['fake',p.id,'shop-b','x','x','PENDING','fake-key'])).rejects.toThrow();});
});
describe('bounded retry and ambiguous transport handling',()=>{
 async function fixture(){await queued();const event=(await claimCustomerMessage())!;const deps:CustomerMessageWorkerDeps={claim:async()=>event,check:async()=>null,reserve:async()=>true,push:vi.fn(async()=>({success:true})),finish:vi.fn(async()=>{})};return {event,deps};}
 it('changed recipient never reaches the transport',async()=>{const {event,deps}=await fixture();deps.check=async()=>'LINE 身分已變更';await processCustomerMessage(event,deps);expect(deps.push).not.toHaveBeenCalled();expect(deps.finish).toHaveBeenCalledWith(event,'SKIPPED','LINE 身分已變更');});
 it('timeouts are pending rather than false delivery success',async()=>{const {event,deps}=await fixture();deps.push=vi.fn(async()=>({success:false}));await processCustomerMessage(event,deps);expect(deps.finish).toHaveBeenCalledWith(event,'PENDING',expect.any(String));});
 it('does not retry after the safe window',async()=>{const {event,deps}=await fixture();event.recipient.firstAttemptAt=new Date(Date.now()-24*3600000);await processCustomerMessage(event,deps);expect(deps.push).not.toHaveBeenCalled();expect(deps.finish).toHaveBeenCalledWith(event,'UNKNOWN',expect.any(String));});
 it('definitive API rejections do not retry',async()=>{const {event,deps}=await fixture();deps.push=vi.fn(async()=>({success:false,httpStatus:400}));await processCustomerMessage(event,deps);expect(deps.finish).toHaveBeenCalledWith(event,'FAILED',expect.any(String));});
});
