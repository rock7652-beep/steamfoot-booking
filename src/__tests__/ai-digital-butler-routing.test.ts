import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll,beforeEach,afterAll,it,expect,vi } from "vitest";
import { AiButlerRepository,type AiSql,type AiDatabase } from "@/server/ai/repository";
import { AiRoutingRepository } from "@/server/ai/routing-repository";
import { AiButlerRouting } from "@/server/ai/routing";
import { AiButlerService,aiIdentity,type TrustedAiScope } from "@/server/ai/service";
import { createOriginalRoutingMock,aiRoutingMessages } from "@/server/ai/routing-mock";
import { MockAiProvider,type AiProvider } from "@/server/ai/provider";
import { syntheticAiKnowledge } from "@/server/ai/knowledge";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
import type { AiRoutingScenario } from "@/server/ai/routing-contract";
vi.mock("@/lib/digital-butler-entitlement",()=>({requireDigitalButlerConversationActivation:vi.fn()}));
const now=new Date("2026-11-26T04:00:00Z"),secret="s".repeat(40);
const scope:TrustedAiScope={storeId:"ai-preview-beauty",actorId:"actor",channel:"TEST",channelAccountId:"dashboard-mock-routing",module:"BEAUTY"};
let db:PGlite,repository:AiButlerRepository,receipts:AiRoutingRepository,router:AiButlerRouting;
const adapt=(c:Pick<PGlite,"query">):AiSql=>({query:async<T extends Record<string,unknown>>(sql:string,values:unknown[]=[]) =>(await c.query<T>(sql,values)).rows});
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE steamfoot_ai_preview_20261125;CREATE TABLE "Store" (id text PRIMARY KEY);CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
 await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-install.sql","utf8"));
 await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-routing.sql","utf8"));
 await db.exec(`INSERT INTO "Store" VALUES ('ai-preview-beauty'),('ai-preview-fitness'),('foreign');INSERT INTO "StoreFeatureEntitlement" VALUES ('ai-preview-beauty','ai_digital_butler','ENABLED',NULL,NULL),('ai-preview-fitness','ai_digital_butler','ENABLED',NULL,NULL)`);
 const database:AiDatabase={...adapt(db),transaction:work=>db.transaction(tx=>work(adapt(tx)))};
 repository=new AiButlerRepository(database);receipts=new AiRoutingRepository(database);router=new AiButlerRouting(receipts,repository,secret,()=>now);
},30000);
afterAll(async()=>db.close());
beforeEach(async()=>{
 await db.exec('RESET ROLE;TRUNCATE "AiButlerDispatch","AiButlerRequest","AiButlerConversation","AiButlerSetting";UPDATE "AiButlerControl" SET stopped=false');
 for(const s of [scope.storeId,"ai-preview-fitness"])await repository.saveSetting(s,{...DEFAULT_AI_SETTING,enabled:true},0,now);
});
const identity=(id="event",s=scope)=>aiIdentity(s,id,secret);
function setup(scenario:AiRoutingScenario,eventId="event",s=scope,override?:AiProvider){
 const original=createOriginalRoutingMock(s,eventId,scenario,secret);
 let calls=0;
 const mock=override??new MockAiProvider();
 const provider:AiProvider={kind:"mock",respond:async input=>{calls++;return mock.respond(input);}};
 const authorize=vi.fn(async()=>undefined);
 const ai=new AiButlerService(repository,provider,authorize,secret,()=>null,()=>true,()=>now);
 const records=syntheticAiKnowledge(s.storeId,s.module,now);
 const snapshot={module:s.module,records,prohibitedTerms:[],fingerprint:"v1"};
 const ports={authorize,original:vi.fn(original.handle),originalReplyAllowed:original.allowReply,providerCalls:()=>calls,
 ai:vi.fn(async(text:string,conversationRevision:number)=>ai.respond(s,eventId,text,records,{snapshot,reload:async()=>snapshot,conversationRevision}))};
 // Canonical fixture only contains hours so this test's known question uses hours.
 const message=scenario==="known"?"營業時間？":aiRoutingMessages[scenario];
 return {ports,message,run:()=>router.respond(s,eventId,scenario,message,ports)};
}
it.each(["original","active","inactive","cancel"] as const)("%s never calls AI or creates an AI usage row",async scenario=>{
 const test=setup(scenario);const result=await test.run();
 expect(result.route).toBe(scenario==="inactive"?"BLOCKED":"ORIGINAL");expect(result.providerCalls).toBe(0);expect(test.ports.ai).not.toHaveBeenCalled();
 expect((await repository.usage(scope.storeId,now)).requests).toBe("0");
 if(scenario==="active")expect(result.originalOutcome).toBe("VALIDATION_FAILED");
});
it("only NO_MATCH can answer published knowledge, with one model call and one durable usage",async()=>{
 const test=setup("known");expect(await test.run()).toMatchObject({route:"AI",outcome:"AI_ANSWER",originalOutcome:"NO_MATCH",providerCalls:1});
 expect((await repository.usage(scope.storeId,now)).requests).toBe("1");
 expect(await test.run()).toMatchObject({route:"DUPLICATE",providerCalls:1,text:""});
 expect((await repository.usage(scope.storeId,now)).requests).toBe("1");
});
it("an event handled by the original engine cannot be changed into a fallback request",async()=>{
 await setup("original").run();const changed=setup("known");
 expect(await changed.run()).toMatchObject({route:"BLOCKED",outcome:"EVENT_CONFLICT",providerCalls:0});expect(changed.ports.original).not.toHaveBeenCalled();
});
it("unknown questions persist handoff, suppress both branches, and require explicit resume",async()=>{
 expect(await setup("unknown").run()).toMatchObject({route:"HUMAN",outcome:"AI_HANDOFF",providerCalls:1});
 const before=setup("original","next");expect(await before.run()).toMatchObject({route:"SILENT",outcome:"HUMAN_ACTIVE",providerCalls:0});expect(before.ports.original).not.toHaveBeenCalled();
 await repository.handoff(identity(),false,now);
 expect(await setup("original","after-resume").run()).toMatchObject({route:"ORIGINAL",providerCalls:0});
});
it("explicit human requests bypass both automatic engines",async()=>{
 const test=setup("handoff");expect(await test.run()).toMatchObject({route:"HUMAN",outcome:"HANDOFF_REQUESTED",providerCalls:0});
 expect(test.ports.original).not.toHaveBeenCalled();expect(test.ports.ai).not.toHaveBeenCalled();
});
it("global AI stop leaves original Mock available but prevents fallback model calls",async()=>{
 await db.exec('UPDATE "AiButlerControl" SET stopped=true');
 expect(await setup("original").run()).toMatchObject({route:"ORIGINAL",providerCalls:0});
 expect(await setup("known","stopped").run()).toMatchObject({route:"BLOCKED",outcome:"STOPPED",providerCalls:0});
});
it("same event is independent across store and actor scope",async()=>{
 expect((await setup("original").run()).route).toBe("ORIGINAL");
 expect((await setup("original","event",{...scope,storeId:"ai-preview-fitness",module:"FITNESS"}).run()).route).toBe("ORIGINAL");
 expect((await setup("original","event",{...scope,actorId:"other"}).run()).route).toBe("ORIGINAL");
});
it("identity, non-TEST channels, and denied permission never enter either engine",async()=>{
 const test=setup("original");test.ports.authorize.mockRejectedValue(new Error("denied"));expect((await test.run()).route).toBe("BLOCKED");expect(test.ports.original).not.toHaveBeenCalled();
 const nonTest={...scope,channel:"LINE" as const};expect(await router.respond(nonTest,"event","original","合成流程入口",test.ports)).toMatchObject({route:"BLOCKED",outcome:"TEST_ONLY"});
});
it("handoff then resume suppresses an old original result even though handoff is false again",async()=>{
 const test=setup("original");let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
 const original=test.ports.original.getMockImplementation()!;
 test.ports.original.mockImplementation(async text=>{entered();await wait;return original(text);});
 const pending=test.run();await started;
 expect((await setup("original","parallel").run()).outcome).toBe("BUSY");
 expect((await setup("handoff","interrupt").run()).route).toBe("HUMAN");
 await repository.handoff(identity(),false,now);release();
 expect(await pending).toMatchObject({route:"SILENT",outcome:"SCOPE_CHANGED",text:""});expect(test.ports.ai).not.toHaveBeenCalled();
});
it("handoff then resume during model await suppresses the old answer and summary",async()=>{
 let release!:()=>void,entered!:()=>void;const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
 const mock=new MockAiProvider();const test=setup("known","late",scope,{kind:"mock",respond:async input=>{entered();await wait;return mock.respond(input);}});
 const pending=test.run();await started;await repository.handoff(identity(),true,now);await repository.handoff(identity(),false,now);release();
 expect(await pending).toMatchObject({route:"SILENT",text:""});
 expect((await db.query('SELECT status FROM "AiButlerRequest"')).rows).toEqual([{status:"SUPPRESSED"}]);
 expect((await db.query('SELECT summary FROM "AiButlerConversation"')).rows).toEqual([{summary:[]}]);
});
it("a race before reserve cannot spend after the coordinator's generation became stale",async()=>{
 const test=setup("known");const ai=test.ports.ai.getMockImplementation()!;
 test.ports.ai.mockImplementation(async(text,revision)=>{await repository.handoff(identity(),true,now);await repository.handoff(identity(),false,now);return ai(text,revision);});
 expect(await test.run()).toMatchObject({route:"SILENT",providerCalls:0});expect((await repository.usage(scope.storeId,now)).requests).toBe("0");
});
it("the dispatch table has no public access and the server role cannot write a foreign store",async()=>{
 await db.exec('SET ROLE steamfoot_ai_preview_20261125');
 await expect(db.query(`INSERT INTO "AiButlerDispatch" ("storeId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES ('foreign','s','e','f',0,'CLAIMED',now())`)).rejects.toThrow();
 await db.exec('RESET ROLE;SET ROLE anon');await expect(db.query('SELECT * FROM "AiButlerDispatch"')).rejects.toThrow();
});

it("in-progress and unknown receipts are not reported as completed duplicates",async()=>{
 const id=identity();const fp="f".repeat(64);
 expect((await receipts.claim(id,fp,false,now)).state).toBe("CLAIMED");
 expect((await receipts.claim(id,fp,false,now)).state).toBe("IN_PROGRESS");
 await receipts.unknown(id,now);
 expect((await receipts.claim(id,fp,false,now)).state).toBe("RESULT_UNKNOWN");
 expect((await receipts.claim(id,"a".repeat(64),false,now)).state).toBe("EVENT_CONFLICT");
});
it("original engine exceptions fail closed, persist receipt unknown and never call AI",async()=>{
 const test=setup("known");test.ports.original.mockRejectedValue(new Error("unavailable"));
 expect(await test.run()).toMatchObject({route:"BLOCKED",outcome:"ROUTING_UNKNOWN",providerCalls:0});
 expect(test.ports.ai).not.toHaveBeenCalled();expect((await repository.conversationState(identity())).handoff).toBe(true);
 expect((await test.run()).outcome).toBe("RESULT_UNKNOWN");
});

it("an unknown receipt blocks a new event in the same generation even if the handoff write did not finish",async()=>{
 await receipts.claim(identity(),"f".repeat(64),false,now);
 await receipts.unknown(identity(),now);
 const next=setup("original","after-unknown");
 expect(await next.run()).toMatchObject({route:"BLOCKED",outcome:"BUSY",providerCalls:0});
 expect(next.ports.original).not.toHaveBeenCalled();
 await repository.handoff(identity(),false,now);
 expect((await setup("original","after-explicit-resume").run()).route).toBe("ORIGINAL");
});
