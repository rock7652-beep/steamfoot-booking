import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { brandManagement } from "@/server/ai/brand-management-core";
import { BRAND_PREVIEW_SERVICE as sid } from "@/server/ai/brand-management-contract";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
import { EMPTY_AI_KNOWLEDGE } from "@/server/ai/knowledge-document";
import type { AiDatabase, AiSql } from "@/server/ai/owner-repository";

const instant=new Date("2026-11-26T12:00:00Z"),secret="offline-brand-management-identity-".repeat(2);
const draft={...EMPTY_AI_KNOWLEDGE,introduction:"合成品牌介紹",faqs:[{question:"產品價格？",answer:"合成測試價格 NT$999，不代表正式價格。"}]};
let db:PGlite,database:AiDatabase;
let actor={id:"ai-preview-brand-hq",role:"ADMIN",auditAllowed:true,storeView:false};
let env:Record<string,string|undefined>,clock:Date;
const queries:string[]=[];
const adapt=(client:Pick<PGlite,"query">):AiSql=>({query:async<T extends Record<string,unknown>>(sql:string,values:unknown[]=[])=>{queries.push(sql);return(await client.query<T>(sql,values)).rows;}});
const controller=(extra:Partial<Parameters<typeof brandManagement>[0]>={})=>brandManagement({database,actor:async()=>actor,assertPreview:()=>{},secret,env,clock:()=>clock,...extra});
const windowFor=(operations:string)=>{env.AI_BRAND_PREVIEW_WRITE_OPERATIONS=operations;env.AI_BRAND_PREVIEW_WRITE_UNTIL=new Date(clock.getTime()+20*60_000).toISOString();};
const enabled=()=>db.exec('UPDATE "AiBrandGrant" SET status=\'ENABLED\'');
const runtime=async<T>(work:()=>Promise<T>)=>{await db.exec('SET ROLE steamfoot_ai_preview_20261125');try{return await work();}finally{await db.exec('RESET ROLE');}};
const counts=async()=> (await db.query<{requests:number;conversations:number;audit:number}>('SELECT (SELECT COUNT(*)::int FROM "AiBrandRequest") AS requests,(SELECT COUNT(*)::int FROM "AiBrandConversation") AS conversations,(SELECT COUNT(*)::int FROM "AiBrandHandoffAudit") AS audit')).rows[0];
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE steamfoot_ai_preview_20261125 LOGIN NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 8;CREATE TABLE "Store"(id text PRIMARY KEY);');
 await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-install.sql","utf8"));
 for(const industrySuffix of ["steamfoot","beauty","fitness","music"]){const id=`ai-preview-${industrySuffix}`;await db.query('INSERT INTO "Store" VALUES($1)',[id]);await db.query('INSERT INTO "AiButlerSetting"("storeId",setting) VALUES($1,\'{"enabled":false}\')',[id]);}
 await db.exec(readFileSync("scripts/sql/ai-digital-butler/brand-preview-review/install.proposed.sql","utf8"));
 await db.exec('GRANT USAGE ON SCHEMA public TO steamfoot_ai_preview_20261125;GRANT SELECT,UPDATE ON "AiButlerControl" TO steamfoot_ai_preview_20261125;CREATE POLICY old_control ON "AiButlerControl" TO steamfoot_ai_preview_20261125 USING(true) WITH CHECK(true);');
 await db.exec(`CREATE TABLE "User"(id text PRIMARY KEY,role text DEFAULT 'ADMIN',status text DEFAULT 'ACTIVE',"passwordHash" text DEFAULT 'offline-only'); INSERT INTO "User"(id) VALUES('ai-preview-brand-hq'); GRANT SELECT ON "User" TO steamfoot_ai_preview_20261125;
 CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text NOT NULL REFERENCES "User", "actorRoleSnapshot" text,source text,"storeId" text,module text,"targetType" text,"targetId" text,action text,summary text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz DEFAULT now());
 ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;GRANT SELECT ON "AuditLog" TO steamfoot_ai_preview_20261125;`);
 await db.exec(readFileSync("scripts/sql/ai-digital-butler/brand-operations-review/audit-acl.proposed.sql","utf8").replaceAll("__QA_WINDOW_UNTIL__",new Date(Date.now()+30*60_000).toISOString()));
 database={...adapt(db),transaction:work=>db.transaction(tx=>work(adapt(tx)))};
},30_000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 actor={id:"ai-preview-brand-hq",role:"ADMIN",auditAllowed:true,storeView:false};env={};clock=new Date(instant);
 await db.exec('RESET ROLE;UPDATE "AiButlerControl" SET stopped=true;UPDATE "AiBrandGrant" SET status=\'HIDDEN\',"startsAt"=NULL,"expiresAt"=NULL;TRUNCATE "AuditLog","AiBrandRequest","AiBrandConversation","AiBrandDispatch","AiBrandHandoffAudit";');
 await db.query('UPDATE "AiBrandSetting" SET setting=$1::jsonb,revision=1',[JSON.stringify(DEFAULT_AI_SETTING)]);
 await db.query('UPDATE "AiBrandKnowledgeDocument" SET draft=$1::jsonb,published=NULL,revision=0,"publishedVersion"=0,"publishedAt"=NULL',[JSON.stringify(draft)]);queries.length=0;
});
it("reads actual stopped Brand configuration under the installed minimum role without creating any activity",async()=>{
 const data=await runtime(()=>controller().snapshot());
 expect(data).toMatchObject({serviceId:sid,grant:"HIDDEN",effectiveGrant:"HIDDEN",globalStopped:true,revision:1,setting:{enabled:false},document:{published:null},usage:{requests:"0",reservedMicros:"0"},handoffs:{total:0}});
 expect(Object.values(data.capabilities).every(x=>!x)).toBe(true);expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
 expect(queries.some(sql=>/FROM "(?:Store|Customer|Booking|StoreFeatureEntitlement)"/.test(sql))).toBe(false);
});
it.each(["OWNER","STAFF","CUSTOMER"])("%s cannot use HQ brand management even with ordinary Store permissions",async role=>{
 actor.role=role;await expect(controller().snapshot()).rejects.toThrow("FORBIDDEN");expect(queries).toEqual([]);
});
it.each(["audit","store-view","outside-preview"])("denies %s before any brand data query",async kind=>{
 if(kind==="audit")actor.auditAllowed=false;if(kind==="store-view")actor.storeView=true;
 await expect(controller(kind==="outside-preview"?{assertPreview:()=>{throw Error("OUTSIDE_PREVIEW");}}:{}).snapshot()).rejects.toThrow();expect(queries).toEqual([]);
});
it.each(["save","publish","withdraw","setting","handoff","resume","test"])("default read-only mode rejects %s without a write",async operation=>{
 const c=controller(),key=(await c.snapshot()).viewKey;
 const request=operation==="setting"?()=>c.saveSetting({setting:DEFAULT_AI_SETTING,revision:1}):operation==="handoff"?()=>c.setHandoff(true):operation==="resume"?()=>c.resume({commandId:randomUUID(),scopeKey:"a".repeat(64),revision:1,viewKey:key}):operation==="test"?()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}):()=>c.changeKnowledge({command:operation,revision:0,draft});
 await expect(runtime<unknown>(request)).rejects.toThrow("READ_ONLY");expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
 expect((await db.query('SELECT revision FROM "AiBrandKnowledgeDocument"')).rows[0]).toEqual({revision:0});
});
it.each(["HIDDEN","LOCKED"])("%s denies a write even with a valid explicit operation window",async status=>{
 windowFor("save");await db.query('UPDATE "AiBrandGrant" SET status=$1',[status]);
 await expect(runtime(()=>controller().changeKnowledge({command:"save",revision:0,draft}))).rejects.toThrow("NOT_ENTITLED");
});
it.each(["expired","future"])("an %s HQ grant remains locked",async boundary=>{
 await enabled();await db.query(`UPDATE "AiBrandGrant" SET ${boundary==="expired"?'"expiresAt"':'"startsAt"'}=$1`,[new Date(clock.getTime()+(boundary==="expired"?-1:1))]);windowFor("save");
 expect((await controller().snapshot()).effectiveGrant).toBe("LOCKED");await expect(controller().changeKnowledge({command:"save",revision:0,draft})).rejects.toThrow("NOT_ENTITLED");
});
it("reviews a saved draft without publishing, granting access or changing its revision",async()=>{
 const c=controller(),r=await runtime(()=>c.reviewKnowledge({revision:0}));expect(r).toMatchObject({success:true,revision:0,sourceCount:2});expect(r.token).toMatch(/^\d+\.[a-f0-9]{64}$/);
 expect((await c.readKnowledge()).document).toMatchObject({revision:0,published:null});expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
 await expect(c.reviewKnowledge({revision:0,storeId:"foreign"})).rejects.toThrow();
});
it("publishing requires review of the same version by the same HQ actor, and still does not enable AI",async()=>{
 await enabled();windowFor("publish");const c=controller(),r=await c.reviewKnowledge({revision:0});
 await expect(c.changeKnowledge({command:"publish",revision:0})).rejects.toThrow("REVIEW_REQUIRED");
 actor={...actor,id:"another-hq"};await expect(controller().changeKnowledge({command:"publish",revision:0,reviewToken:r.token})).rejects.toThrow("REVIEW_REQUIRED");
 actor={...actor,id:"ai-preview-brand-hq"};const result=await runtime(()=>c.changeKnowledge({command:"publish",revision:0,reviewToken:r.token}));expect(result.document).toMatchObject({published:draft,publishedVersion:1,revision:1});
 expect((await c.snapshot()).setting.enabled).toBe(false);expect((await c.snapshot()).globalStopped).toBe(true);expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
});
it("saved changes, expiration and a separate publish permission invalidate old review receipts",async()=>{
 await enabled();windowFor("save,publish");const c=controller(),review=await c.reviewKnowledge({revision:0});
 await runtime(()=>c.changeKnowledge({command:"save",revision:0,draft:{...draft,introduction:"更新的合成內容"}}));
 await expect(c.changeKnowledge({command:"publish",revision:1,reviewToken:review.token})).rejects.toThrow("REVIEW_REQUIRED");
 const latest=await c.reviewKnowledge({revision:1});clock=new Date(clock.getTime()+6*60_000);
 await expect(c.changeKnowledge({command:"publish",revision:1,reviewToken:latest.token})).rejects.toThrow("REVIEW_REQUIRED");
 windowFor("save");await expect(c.changeKnowledge({command:"publish",revision:1,reviewToken:latest.token})).rejects.toThrow("READ_ONLY");
});
it("revoked grants and expired windows after review prevent publication",async()=>{
 await enabled();windowFor("publish");const c=controller(),r=await c.reviewKnowledge({revision:0});await db.exec('UPDATE "AiBrandGrant" SET status=\'LOCKED\'');
 await expect(c.changeKnowledge({command:"publish",revision:0,reviewToken:r.token})).rejects.toThrow("NOT_ENTITLED");await enabled();clock=new Date(clock.getTime()+21*60_000);
 await expect(c.changeKnowledge({command:"publish",revision:0,reviewToken:r.token})).rejects.toThrow("READ_ONLY");
});
it("cannot enable a stopped service, increase a quota, or request a real provider",async()=>{
 await enabled();windowFor("setting,test");const c=controller();
 await expect(c.saveSetting({revision:1,setting:{...DEFAULT_AI_SETTING,enabled:true}})).rejects.toThrow("GLOBAL_STOPPED");
 await expect(c.saveSetting({revision:1,setting:{...DEFAULT_AI_SETTING,dailyRequests:21}})).rejects.toThrow("SETTING_SCOPE");
 await expect(c.test({eventId:randomUUID(),question:"產品價格？",provider:"openai"})).rejects.toThrow();
 await expect(c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"})).rejects.toThrow("GLOBAL_STOPPED");
 expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
});
it("handoff recovery is always through the audited queue and retains command identity",async()=>{
 await enabled();windowFor("handoff,resume");const c=controller();await runtime(()=>c.setHandoff(true));
 await expect(c.setHandoff(false)).rejects.toThrow("AUDITED_RESUME_REQUIRED");
 const s=await c.snapshot(),row=s.handoffs.rows[0],command={viewKey:s.viewKey,scopeKey:row.scopeKey,revision:row.revision,commandId:randomUUID()};
 const result=await runtime(()=>c.resume(command));expect(result.duplicate).toBe(false);expect((await c.resume(command)).duplicate).toBe(true);
 expect(await counts()).toEqual({requests:0,conversations:1,audit:1});
 await expect(c.readHandoffs({viewKey:"b".repeat(64)})).rejects.toThrow("SCOPE_CHANGED");
});
it("an actor change during a pending read rejects the response",async()=>{
 let calls=0;const c=controller({actor:async()=>{calls++;return {...actor,id:calls>1?"changed-user":actor.id};}});
 await expect(c.snapshot()).rejects.toThrow("FORBIDDEN");
});

it("save, review, publish and withdraw use the same revision chain under the minimum role",async()=>{
 await enabled();windowFor("save,publish,withdraw");const c=controller();
 const saved=await runtime(()=>c.changeKnowledge({command:"save",revision:0,draft:{...draft,introduction:"已編輯合成品牌"}}));
 const review=await runtime(()=>c.reviewKnowledge({revision:saved.document.revision}));
 const published=await runtime(()=>c.changeKnowledge({command:"publish",revision:saved.document.revision,reviewToken:review.token}));
 const withdrawn=await runtime(()=>c.changeKnowledge({command:"withdraw",revision:published.document.revision}));
 expect(withdrawn.document).toMatchObject({revision:3,published:null,publishedVersion:2});
 expect((await c.snapshot()).setting.enabled).toBe(false);expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
});
it("an explicitly unlocked local window can toggle only the Brand setting and leaves Store switches unchanged",async()=>{
 await enabled();await db.exec('UPDATE "AiButlerControl" SET stopped=false');windowFor("setting,test");const c=controller();
 const before=await db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"');
 const on=await runtime(()=>c.saveSetting({revision:1,setting:{...DEFAULT_AI_SETTING,enabled:true}}));expect(on.setting.enabled).toBe(true);expect((await c.snapshot()).capabilities.test).toBe(true);
 const off=await runtime(()=>c.saveSetting({revision:on.revision,setting:{...DEFAULT_AI_SETTING,enabled:false}}));expect(off.setting.enabled).toBe(false);expect((await c.snapshot()).capabilities.test).toBe(false);
 expect((await db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"')).rows).toEqual(before.rows);
 expect(await counts()).toEqual({requests:0,conversations:0,audit:0});
});

it("full management flow cites only the published version, handles handoff, dedup and withdrawal",async()=>{
 await enabled();await db.exec('UPDATE "AiButlerControl" SET stopped=false');windowFor("save,publish,withdraw,setting,handoff,resume,test");env.AI_DIGITAL_BUTLER_ENABLED="1";
 const c=controller();await runtime(()=>c.saveSetting({revision:1,setting:{...DEFAULT_AI_SETTING,enabled:true}}));
 const saved=await runtime(()=>c.changeKnowledge({command:"save",revision:0,draft}));const r=await c.reviewKnowledge({revision:saved.document.revision});
 const published=await runtime(()=>c.changeKnowledge({command:"publish",revision:saved.document.revision,reviewToken:r.token}));
 const firstEvent=randomUUID(),ask=()=>runtime(()=>c.test({eventId:firstEvent,question:"產品價格？",provider:"mock"}));
 const answer=await ask();expect(answer.result).toMatchObject({outcome:"ANSWER"});expect(answer.result.text).toContain("999");const firstSource=answer.result.sourceIds[0];
 expect((await ask()).result.outcome).toBe("DUPLICATE");
 const edit=await runtime(()=>c.changeKnowledge({command:"save",revision:published.document.revision,draft:{...draft,faqs:[{question:"產品價格？",answer:"合成測試價格 NT$888"}]}}));
 const stillOld=await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}));expect(stillOld.result.sourceIds).toEqual([firstSource]);expect(stillOld.result.text).toContain("999");
 const review=await c.reviewKnowledge({revision:edit.document.revision});const newest=await runtime(()=>c.changeKnowledge({command:"publish",revision:edit.document.revision,reviewToken:review.token}));
 const fresh=await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}));expect(fresh.result.outcome).toBe("ANSWER");expect(fresh.result.text).toContain("888");expect(fresh.result.sourceIds[0]).not.toBe(firstSource);
 const unknown=await runtime(()=>c.test({eventId:randomUUID(),question:"未公告的測試承諾？",provider:"mock"}));expect(unknown.result.outcome).toBe("HANDOFF");
 const before=await counts();expect((await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}))).result.outcome).toBe("STOPPED");expect(await counts()).toEqual(before);
 const s=await c.snapshot(),row=s.handoffs.rows[0];await runtime(()=>c.resume({viewKey:s.viewKey,scopeKey:row.scopeKey,revision:row.revision,commandId:randomUUID()}));
 await runtime(()=>c.changeKnowledge({command:"withdraw",revision:newest.document.revision}));
 expect((await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}))).result).toMatchObject({outcome:"HANDOFF",sourceIds:[]});
 const logs=await runtime(()=>database.query('SELECT * FROM "AuditLog"'));expect(logs.length).toBeGreaterThan(7);expect(logs.every(x=>x.actorUserId==="ai-preview-brand-hq"&&x.storeId===null&&x.targetId===sid)).toBe(true);
 const ledger=await db.query<{provider:string;status:string;heldMicros:string|number|bigint;estimatedMicros:string|number|bigint|null}>('SELECT provider,status,"heldMicros","estimatedMicros" FROM "AiBrandRequest"');expect(ledger.rows.length).toBe(5);expect(ledger.rows.every(x=>x.provider==="mock"&&x.status==="COMPLETE"&&String(x.heldMicros)==="0"&&String(x.estimatedMicros)==="0")).toBe(true);expect(logs.filter(x=>(x.afterJson as {operation:string}).operation==="test").length).toBe(5);
});
it("audit failure rolls back the knowledge mutation instead of committing an unaudited change",async()=>{
 await enabled();windowFor("save");await db.exec('REVOKE INSERT(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") ON "AuditLog" FROM steamfoot_ai_preview_20261125');
 try{await expect(runtime(()=>controller().changeKnowledge({command:"save",revision:0,draft}))).rejects.toThrow();expect((await controller().readKnowledge()).document.revision).toBe(0);}
 finally{await db.exec('GRANT INSERT(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") ON "AuditLog" TO steamfoot_ai_preview_20261125');}
});

it("the request limit blocks a second Mock reservation without changing Store usage",async()=>{
 await enabled();await db.exec('UPDATE "AiButlerControl" SET stopped=false');windowFor("test");env.AI_DIGITAL_BUTLER_ENABLED="1";
 await db.query('UPDATE "AiBrandSetting" SET setting=$1::jsonb',[JSON.stringify({...DEFAULT_AI_SETTING,enabled:true,dailyRequests:1})]);
 await db.query('UPDATE "AiBrandKnowledgeDocument" SET published=draft,"publishedVersion"=1,"publishedAt"=$1',[clock]);
 const c=controller();expect((await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}))).result.outcome).toBe("ANSWER");
 const before=await counts();expect((await runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}))).result.outcome).toBe("STOPPED");expect(await counts()).toEqual(before);
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM "AiButlerRequest"')).rows[0].n).toBe(0);
});
it("the operation audit ACL rejects Store targets, other actors and update/delete",async()=>{
 await db.query('INSERT INTO "User"(id) VALUES($1) ON CONFLICT DO NOTHING',["another-hq"]);
 await enabled();windowFor("save");await runtime(()=>controller().changeKnowledge({command:"save",revision:0,draft}));
 await expect(runtime(()=>database.query('UPDATE "AuditLog" SET summary=\'tampered\''))).rejects.toThrow();
 await expect(runtime(()=>database.query('DELETE FROM "AuditLog"'))).rejects.toThrow();
 await expect(runtime(()=>database.query(`INSERT INTO "AuditLog"(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,"afterJson") VALUES('forged','ai-preview-brand-hq','ADMIN','AI_BRAND_PREVIEW','ai-preview-beauty','AI_BRAND','AiBrandService',$1,'UPDATE','{"operation":"save"}')`,[sid]))).rejects.toThrow();
 await expect(runtime(()=>database.query(`INSERT INTO "AuditLog"(id,"actorUserId","actorRoleSnapshot",source,module,"targetType","targetId",action,"afterJson") VALUES('forged-other','another-hq','ADMIN','AI_BRAND_PREVIEW','AI_BRAND','AiBrandService',$1,'UPDATE','{"operation":"save"}')`,[sid]))).rejects.toThrow();
});

it("management mutations and audited resume do not open a second auth connection inside the transaction",async()=>{
 await enabled();windowFor("save,handoff,resume");let inTransaction=false;
 const databaseWithSingleConnection:AiDatabase={...database,transaction:work=>database.transaction(async tx=>{inTransaction=true;try{return await work(tx);}finally{inTransaction=false;}})};
 const c=controller({database:databaseWithSingleConnection,actor:async()=>{if(inTransaction)throw Error("GLOBAL_AUTH_INSIDE_TX");return actor;}});
 await runtime(()=>c.changeKnowledge({command:"save",revision:0,draft}));await runtime(()=>c.setHandoff(true));const s=await c.snapshot(),row=s.handoffs.rows[0];
 expect((await runtime(()=>c.resume({viewKey:s.viewKey,scopeKey:row.scopeKey,revision:row.revision,commandId:randomUUID()}))).success).toBe(true);
});

it("a stale actor cannot commit after the User is suspended even before the HTTP session refreshes",async()=>{
 await enabled();windowFor("save");await db.query('UPDATE "User" SET status=\'SUSPENDED\' WHERE id=$1',[actor.id]);
 try{await expect(runtime(()=>controller().changeKnowledge({command:"save",revision:0,draft}))).rejects.toThrow();expect((await controller().readKnowledge()).document.revision).toBe(0);}
 finally{await db.query('UPDATE "User" SET status=\'ACTIVE\' WHERE id=$1',[actor.id]);}
});

it("the Preview hard cap allows eight distinct Mock events and an idempotent replay without a ninth reservation",async()=>{
 await enabled();await db.exec('UPDATE "AiButlerControl" SET stopped=false');windowFor("test");env.AI_DIGITAL_BUTLER_ENABLED="1";
 await db.query('UPDATE "AiBrandSetting" SET setting=$1::jsonb',[JSON.stringify({...DEFAULT_AI_SETTING,enabled:true})]);await db.query('UPDATE "AiBrandKnowledgeDocument" SET published=draft,"publishedVersion"=1,"publishedAt"=$1',[clock]);
 const c=controller(),firstId=randomUUID();for(let i=0;i<8;i++)expect((await runtime(()=>c.test({eventId:i===0?firstId:randomUUID(),question:"產品價格？",provider:"mock"}))).result.outcome).toBe("ANSWER");
 await expect(runtime(()=>c.test({eventId:randomUUID(),question:"產品價格？",provider:"mock"}))).rejects.toThrow("TEST_LIMIT");
 expect((await runtime(()=>c.test({eventId:firstId,question:"產品價格？",provider:"mock"}))).result.outcome).toBe("DUPLICATE");expect((await counts()).requests).toBe(8);
});
