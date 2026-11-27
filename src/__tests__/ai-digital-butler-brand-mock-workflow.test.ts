import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {brandManagement} from "@/server/ai/brand-management-core";
import {brandIdentity,type TrustedBrandScope} from "@/server/ai/principal";
import {projectBrandKnowledge} from "@/server/ai/brand-knowledge";
import {MockAiProvider} from "@/server/ai/provider";
import {createBrandKnowledgeFixture} from "../../scripts/qa/ai-brand-knowledge-fixture.mjs";

let f:Awaited<ReturnType<typeof createBrandKnowledgeFixture>>;
const secret="offline-brand-mock-only-identity-secret",question="合成產品價格？";
const draft={introduction:"品牌合成介紹",faqs:[{question,answer:"品牌合成價格 NT$999"}],prohibitedTerms:[],references:{hours:false,services:false,prices:false}};
let storeRequests:unknown[],storeDispatch:unknown[];
let env:Record<string,string>,controller:ReturnType<typeof brandManagement>,transportCalls=0;
const evidence:unknown[]=[];
const run=<T>(work:()=>Promise<T>):Promise<T>=>f.runtime(work);
const ask=(eventId=randomUUID(),text=question)=>run(()=>controller.test({eventId,question:text,provider:"mock"}));
const rows=async(table:string)=>(await f.db.query<Record<string,unknown>>(`SELECT * FROM "${table}" ORDER BY 1,2`)).rows;
const counts=async()=>({requests:await rows("AiBrandRequest"),conversations:await rows("AiBrandConversation"),audit:await rows("AuditLog")});
async function document(published:typeof draft|null=draft,version=1){await f.db.query('UPDATE "AiBrandKnowledgeDocument" SET draft=$2::jsonb,published=$3::jsonb,revision=$4,"publishedVersion"=$4,"publishedAt"=$5 WHERE "serviceId"=$1',[f.sid,JSON.stringify(draft),published?JSON.stringify(published):null,version,published?new Date(Date.now()-1000):null]);}
async function fault(condition="true"){await f.db.exec(`CREATE FUNCTION local_mock_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'LOCAL_MOCK_AUDIT_FAULT';END IF;RETURN NEW;END $$;CREATE TRIGGER zz_local_mock_audit_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION local_mock_audit_fault();`);}
beforeAll(async()=>{f=await createBrandKnowledgeFixture({operations:["test"]});await f.prepare();await f.db.exec(readFileSync('scripts/sql/ai-digital-butler/preview-routing.sql','utf8'));
 for(const [i,suffix] of ['steamfoot','beauty','fitness','music'].entries()){
 const key=String(i+1).repeat(64);await f.db.query('INSERT INTO "AiButlerRequest"("storeId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES($1,$2,$2,\'mock\',\'gpt-6-luna\',\'COMPLETE\',1234,now())',['ai-preview-'+suffix,key]);
 await f.db.query('INSERT INTO "AiButlerDispatch"("storeId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES($1,$2,$2,$2,0,\'COMPLETE\',now())',['ai-preview-'+suffix,key]);}
 storeRequests=await rows("AiButlerRequest");storeDispatch=await rows("AiButlerDispatch");expect(await f.verifyKnowledgeSchema()).toMatchObject({columnsMatched:12,policiesMatched:4,auditTriggers:2});},30_000);
beforeEach(async()=>{
 await f.db.exec('RESET ROLE;DROP TRIGGER IF EXISTS zz_local_mock_audit_fault ON "AuditLog";DROP FUNCTION IF EXISTS local_mock_audit_fault();TRUNCATE "AiBrandRequest","AiBrandConversation","AuditLog";UPDATE "AiButlerControl" SET stopped=false;');
 await f.db.query('UPDATE "AiBrandGrant" SET status=\'ENABLED\' WHERE "serviceId"=$1',[f.sid]);
 await f.db.query('UPDATE "AiBrandSetting" SET setting=jsonb_set(setting,\'{enabled}\',\'true\') WHERE "serviceId"=$1',[f.sid]);await document();
 env={AI_BRAND_PREVIEW_WRITE_OPERATIONS:"test",AI_BRAND_PREVIEW_WRITE_UNTIL:f.end,AI_DIGITAL_BUTLER_ENABLED:"1"};
 controller=brandManagement({database:f.database,actor:f.actor,assertPreview:()=>{},secret,env});
 vi.stubGlobal("fetch",async()=>{transportCalls++;throw Error("LOCAL_NETWORK_FORBIDDEN");});
});
afterEach(async context=>{
 vi.restoreAllMocks();vi.unstubAllGlobals();
 expect(transportCalls).toBe(0);
 expect((await f.db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"')).rows).toEqual(f.initialStores);
 expect((await f.db.query('SELECT * FROM "AiButlerKnowledgeDocument" ORDER BY "storeId"')).rows).toEqual(f.storeKnowledge);
 expect((await f.db.query('SELECT * FROM "AiBrandKnowledgeDocument" WHERE "serviceId"=\'local-other-brand\'')).rows).toEqual(f.otherBrand);
 expect(await rows("AiButlerRequest")).toEqual(storeRequests);expect(await rows("AiButlerDispatch")).toEqual(storeDispatch);expect(await rows("AiBrandDispatch")).toEqual([]);
 evidence.push({case:context.task.name,ledger:await rows("AiBrandRequest"),audits:(await rows("AuditLog")).map((a:Record<string,unknown>)=>({actor:a.actorUserId,role:a.actorRoleSnapshot,login:a.loginRecordId,storeId:a.storeId,after:a.afterJson})),conversation:await rows("AiBrandConversation"),storeDataUnchanged:true});
});
afterAll(async()=>{
 await f.db.exec('RESET ROLE;UPDATE "AiButlerControl" SET stopped=true;');await f.db.query('UPDATE "AiBrandGrant" SET status=\'HIDDEN\' WHERE "serviceId"=$1',[f.sid]);await f.db.query('UPDATE "AiBrandSetting" SET setting=jsonb_set(setting,\'{enabled}\',\'false\') WHERE "serviceId"=$1',[f.sid]);await document(null);
 const [safe]=(await f.db.query<{globalStopped:boolean;brandHidden:boolean;brandDisabled:boolean;fourStoresOff:boolean;knowledgeUnpublished:boolean}>(`SELECT (SELECT stopped FROM "AiButlerControl" WHERE id='global') AS "globalStopped",g.status='HIDDEN' AS "brandHidden",s.setting->>'enabled'='false' AS "brandDisabled",(SELECT count(*)=4 FROM "AiButlerSetting" WHERE setting->>'enabled'='false') AS "fourStoresOff",k.published IS NULL AS "knowledgeUnpublished" FROM "AiBrandGrant" g JOIN "AiBrandSetting" s USING("serviceId") JOIN "AiBrandKnowledgeDocument" k USING("serviceId") WHERE g."serviceId"=$1`,[f.sid])).rows;expect(Object.values(safe).every(Boolean)).toBe(true);
 mkdirSync('artifacts/ai-digital-butler/brand-mock',{recursive:true});writeFileSync('artifacts/ai-digital-butler/brand-mock/local-workflow.json',JSON.stringify({kind:'Local real Brand management/core -> matching PGlite/RLS/minimum role/real AuditLog triggers; not cloud acceptance',schema:await f.verifyKnowledgeSchema(),cases:evidence,transportCalls,realOpenAiCalls:0,realOutbound:0,remoteWrites:0,final:safe},null,2)+'\n');await f.db.close();
});
it("reads the actual published Brand knowledge and records one zero-cost Mock event with trusted audit",async()=>{
 const r=await ask();expect(r.result).toMatchObject({outcome:"ANSWER",text:"品牌合成價格 NT$999"});const doc=(await run(()=>controller.readKnowledge())).document;
 expect(r.result.sourceIds).toEqual([projectBrandKnowledge(f.sid,doc,new Date()).records[1].id]);expect(r.usage).toMatchObject({requests:"1",reservedMicros:"0",inputTokens:"100",outputTokens:"20"});
 const [ledger]=await rows("AiBrandRequest");expect(ledger).toMatchObject({serviceId:f.sid,provider:"mock",status:"COMPLETE",outcome:"ANSWER"});expect(String(ledger.heldMicros)).toBe("0");expect(String(ledger.estimatedMicros)).toBe("0");
 const [audit]=await rows("AuditLog");expect(audit).toMatchObject({actorUserId:f.uid,actorRoleSnapshot:"ADMIN",loginRecordId:"local-brand-login",storeId:null,targetId:f.sid,afterJson:{operation:"test"}});expect((await rows("AuditLog")).length).toBe(1);
});
it.each(["never-published","withdrawn"])("%s knowledge cannot be cited and persists an automatic human handoff",async state=>{
 await document(null,state==="withdrawn"?2:0);const provider=vi.spyOn(MockAiProvider.prototype,"respond");const r=await ask();expect(r.result).toMatchObject({outcome:"HANDOFF",sourceIds:[]});expect(provider).not.toHaveBeenCalled();
 expect((await rows("AiBrandConversation"))[0]).toMatchObject({handoff:true,revision:1});expect((await rows("AiBrandRequest"))[0]).toMatchObject({status:"COMPLETE",outcome:"HANDOFF",inputTokens:0,outputTokens:0});
});
it("keeps the published version until re-publication and never cites a previous version afterwards",async()=>{
 const first=await ask(),newDraft={...draft,faqs:[{question,answer:"新版品牌合成價格 NT$888"}]};
 await f.db.query('UPDATE "AiBrandKnowledgeDocument" SET draft=$2::jsonb,revision=2 WHERE "serviceId"=$1',[f.sid,JSON.stringify(newDraft)]);
 const stillPublished=await ask();expect(stillPublished.result.sourceIds).toEqual(first.result.sourceIds);expect(stillPublished.result.text).toContain("999");await document(newDraft,3);
 const newest=await ask();expect(newest.result.text).toContain("888");expect(newest.result.sourceIds).not.toEqual(first.result.sourceIds);
});
it.each(["withdraw","republish"])("a %s during Mock selection suppresses stale sources",async change=>{
 const original=MockAiProvider.prototype.respond;vi.spyOn(MockAiProvider.prototype,"respond").mockImplementation(async function(this:MockAiProvider,input){const result=await original.call(this,input);await document(change==="withdraw"?null:{...draft,faqs:[{question,answer:"新版 NT$777"}]},2);return result;});
 const r=await ask();expect(r.result).toMatchObject({outcome:"HANDOFF",sourceIds:[]});expect(r.result.text).not.toContain("999");expect((await rows("AiBrandConversation"))[0].handoff).toBe(true);
});
it("unknown questions enter persisted handoff and subsequent questions stay silent without a new ledger",async()=>{
 expect((await ask(undefined,"未公告的承諾？")).result.outcome).toBe("HANDOFF");const before=await counts();expect((await ask()).result.outcome).toBe("STOPPED");expect(await counts()).toEqual(before);
 expect((await run(()=>controller.snapshot())).synthetic).toMatchObject({handoff:true,revision:1});
});
it("identical event replay, including changed text, does not call the provider or charge/create another ledger",async()=>{
 const event=randomUUID(),provider=vi.spyOn(MockAiProvider.prototype,"respond");await ask(event);const before=await counts();expect((await ask(event)).result.outcome).toBe("DUPLICATE");expect((await ask(event,"另一個問題")).result.outcome).toBe("DUPLICATE");expect(await counts()).toEqual(before);expect(provider).toHaveBeenCalledTimes(1);
});
it.each(["setting-off","global-stop","framework-off","locked","hidden","expired-window"])("%s rejects answers without usage or audit writes",async state=>{
 if(state==="setting-off")await f.db.query('UPDATE "AiBrandSetting" SET setting=jsonb_set(setting,\'{enabled}\',\'false\') WHERE "serviceId"=$1',[f.sid]);
 if(state==="global-stop")await f.db.exec('UPDATE "AiButlerControl" SET stopped=true');if(state==="framework-off")env.AI_DIGITAL_BUTLER_ENABLED="0";
 if(state==="locked"||state==="hidden")await f.db.query('UPDATE "AiBrandGrant" SET status=$2 WHERE "serviceId"=$1',[f.sid,state.toUpperCase()]);if(state==="expired-window")env.AI_BRAND_PREVIEW_WRITE_UNTIL=new Date(Date.now()-1000).toISOString();
 const provider=vi.spyOn(MockAiProvider.prototype,"respond"),before=await counts();try{expect((await ask()).result.outcome).toBe("STOPPED");}catch(e){expect(String(e)).toMatch(/GLOBAL_STOPPED|NOT_ENTITLED|READ_ONLY/);}expect(provider).not.toHaveBeenCalled();expect(await counts()).toEqual(before);
});
it.each(["global-stop","setting-off"])("%s while the Mock response is pending suppresses the answer and settles once",async state=>{
 const original=MockAiProvider.prototype.respond;vi.spyOn(MockAiProvider.prototype,"respond").mockImplementation(async function(this:MockAiProvider,input){const result=await original.call(this,input);if(state==="global-stop")await f.db.exec('UPDATE "AiButlerControl" SET stopped=true');else await f.db.query('UPDATE "AiBrandSetting" SET setting=jsonb_set(setting,\'{enabled}\',\'false\') WHERE "serviceId"=$1',[f.sid]);return result;});
 expect((await ask()).result.outcome).toBe("STOPPED");expect((await rows("AiBrandRequest"))[0]).toMatchObject({status:"SUPPRESSED",outcome:"SUPPRESSED"});expect(await rows("AiBrandConversation")).toEqual([]);
});
it("reservation audit failure rolls back the request and does not invoke the Mock provider",async()=>{
 await fault();const before=await counts(),provider=vi.spyOn(MockAiProvider.prototype,"respond");expect((await ask()).result.outcome).toBe("STOPPED");expect(provider).not.toHaveBeenCalled();expect(await counts()).toEqual(before);
});
it("settlement audit failure rolls back settlement then conservatively marks the original request UNKNOWN",async()=>{
 await fault('EXISTS(SELECT 1 FROM "AiBrandRequest" WHERE status=\'COMPLETE\')');const event=randomUUID();expect((await ask(event)).result.outcome).toBe("HANDOFF");
 expect((await rows("AiBrandRequest"))[0]).toMatchObject({status:"UNKNOWN",outcome:"PROVIDER_OR_SETTLEMENT_UNKNOWN",inputTokens:null,outputTokens:null});expect((await rows("AiBrandConversation"))[0]).toMatchObject({handoff:true});expect((await rows("AuditLog")).length).toBe(1);
 const before=await counts();expect((await ask(event)).result.outcome).toBe("DUPLICATE");expect(await counts()).toEqual(before);
});
it("a throwing Mock provider preserves one UNKNOWN reservation and never retries",async()=>{
 const provider=vi.spyOn(MockAiProvider.prototype,"respond").mockRejectedValue(Error("LOCAL_PROVIDER_FAULT")),event=randomUUID();expect((await ask(event)).result.outcome).toBe("HANDOFF");const before=await counts();expect((await ask(event)).result.outcome).toBe("DUPLICATE");expect(provider).toHaveBeenCalledTimes(1);expect(await counts()).toEqual(before);expect((await rows("AiBrandRequest"))[0].status).toBe("UNKNOWN");
});
it("Brand operator inputs cannot inject Store ownership or choose OpenAI",async()=>{
 for(const extra of [{storeId:"ai-preview-beauty"},{serviceId:"local-other-brand"},{provider:"openai"}])await expect(run(()=>controller.test({eventId:randomUUID(),question,provider:"mock",...extra}))).rejects.toThrow();expect(await counts()).toEqual({requests:[],conversations:[],audit:[]});
 const scope:TrustedBrandScope={principal:{kind:"BRAND",serviceId:f.sid},actorId:f.uid,channel:"TEST",channelAccountId:"brand-dashboard"};expect(brandIdentity(scope,randomUUID(),secret).ownerId).toBe(f.sid);
});

it("concurrent copies of one event reserve and settle only one Mock request",async()=>{
 const event=randomUUID(),provider=vi.spyOn(MockAiProvider.prototype,"respond");const results=await run(()=>Promise.all([controller.test({eventId:event,question,provider:"mock"}),controller.test({eventId:event,question,provider:"mock"})]));expect(results.map(x=>x.result.outcome).sort()).toEqual(["ANSWER","DUPLICATE"]);expect(provider).toHaveBeenCalledTimes(1);expect((await rows("AiBrandRequest")).length).toBe(1);expect((await rows("AuditLog")).length).toBe(1);
});
it("eight-event cap permits replay but refuses a ninth event without resetting budgets",async()=>{
 const provider=vi.spyOn(MockAiProvider.prototype,"respond"),events=Array.from({length:8},()=>randomUUID());for(const event of events)expect((await ask(event)).result.outcome).toBe("ANSWER");const before=await counts();expect((await ask(events[7])).result.outcome).toBe("DUPLICATE");await expect(ask()).rejects.toThrow("AI_BRAND_TEST_LIMIT");expect(await counts()).toEqual(before);expect(provider).toHaveBeenCalledTimes(8);
 expect((await run(()=>controller.snapshot())).usage).toMatchObject({requests:"8",reservedMicros:"0",budgetMicros:1000000});expect((await run(()=>f.database.query("SELECT total,concurrent FROM public.ai_owner_global_totals()")))[0]).toMatchObject({total:"4936",concurrent:"0"});
});
