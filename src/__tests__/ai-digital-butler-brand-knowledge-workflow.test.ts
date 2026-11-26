import {afterEach,expect,it} from "vitest";
import {brandManagement} from "@/server/ai/brand-management-core";
import {createBrandKnowledgeFixture} from "../../scripts/qa/ai-brand-knowledge-fixture.mjs";
let fixture:Awaited<ReturnType<typeof createBrandKnowledgeFixture>>|undefined;
afterEach(async()=>{await fixture?.db.close();fixture=undefined;});
const draft={introduction:"合成品牌介紹",faqs:[{question:"如何申請試用？",answer:"本機合成驗收說明，不代表正式承諾。"}],prohibitedTerms:[],references:{hours:false,services:false,prices:false}};
async function setup(){const f=fixture=await createBrandKnowledgeFixture();await f.prepare();const c=brandManagement({database:f.database,actor:f.actor,assertPreview:()=>{},secret:"offline-knowledge-only-identity-secret",env:{AI_BRAND_PREVIEW_WRITE_OPERATIONS:"save,publish,withdraw",AI_BRAND_PREVIEW_WRITE_UNTIL:f.end}});return {f,c,run:<T>(work:()=>Promise<T>)=>f.runtime(work)};}
it("saves, edits, reviews, publishes and withdraws actual Brand knowledge with verified audits while all AI remains stopped",async()=>{
 const {f,c,run}=await setup();expect(await f.verifyKnowledgeSchema()).toMatchObject({columnsMatched:12,constraintsMatched:10,policiesMatched:4,knowledgeTriggers:0,auditTriggers:2});
 const first=await run(()=>c.changeKnowledge({command:"save",revision:0,draft}));const review=await run(()=>c.reviewKnowledge({revision:first.document.revision}));
 const published=await run(()=>c.changeKnowledge({command:"publish",revision:first.document.revision,reviewToken:review.token}));expect(published.document.published).toEqual(draft);
 const next={...draft,faqs:[{question:"如何申請試用？",answer:"已編輯的合成試用說明。"}]};const edited=await run(()=>c.changeKnowledge({command:"save",revision:published.document.revision,draft:next}));expect(edited.document.published).toEqual(draft);expect((await run(()=>c.readKnowledge())).document.draft).toEqual(next);
 await expect(run(()=>c.changeKnowledge({command:"publish",revision:edited.document.revision,reviewToken:review.token}))).rejects.toThrow("REVIEW_REQUIRED");
 const reviewed=await run(()=>c.reviewKnowledge({revision:edited.document.revision}));const latest=await run(()=>c.changeKnowledge({command:"publish",revision:edited.document.revision,reviewToken:reviewed.token}));expect(latest.document.published).toEqual(next);
 const withdrawn=await run(()=>c.changeKnowledge({command:"withdraw",revision:latest.document.revision}));expect(withdrawn.document).toMatchObject({draft:next,published:null,revision:5,publishedVersion:3,publishedAt:null});expect((await run(()=>c.readKnowledge())).document).toEqual(withdrawn.document);
 const audits=(await f.db.query<{actorUserId:string;actorRoleSnapshot:string;loginRecordId:string;storeId:string|null;afterJson:{operation:string}}>('SELECT * FROM "AuditLog" ORDER BY "createdAt",id')).rows;expect(audits.map(a=>a.afterJson.operation)).toEqual(["save","publish","save","publish","withdraw"]);expect(audits.every(a=>a.actorUserId===f.uid&&a.actorRoleSnapshot==="ADMIN"&&a.loginRecordId==="local-brand-login"&&a.storeId===null)).toBe(true);
 expect((await f.db.query('SELECT * FROM "AiButlerKnowledgeDocument" ORDER BY "storeId"')).rows).toEqual(f.storeKnowledge);expect((await f.db.query('SELECT * FROM "AiBrandKnowledgeDocument" WHERE "serviceId"=\'local-other-brand\'')).rows).toEqual(f.otherBrand);
 const s=await run(()=>c.snapshot());expect(s.globalStopped).toBe(true);expect(s.setting.enabled).toBe(false);expect(s.usage.requests).toBe("0");
},30_000);
it.each(["save","publish","withdraw"] as const)("a real audit append failure rolls back %s and its revision/publication atomically",async command=>{
 const {f,c,run}=await setup();let doc=(await run(()=>c.changeKnowledge({command:"save",revision:0,draft}))).document;let token:string|undefined;
 if(command!=="save"){token=(await run(()=>c.reviewKnowledge({revision:doc.revision}))).token;if(command==="withdraw")doc=(await run(()=>c.changeKnowledge({command:"publish",revision:doc.revision,reviewToken:token}))).document;}
 const before=JSON.stringify({doc,rows:(await f.db.query('SELECT * FROM "AuditLog" ORDER BY id')).rows});await f.db.exec(`CREATE FUNCTION local_knowledge_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_KNOWLEDGE_AUDIT_FAULT';END $$;CREATE TRIGGER zz_local_knowledge_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION local_knowledge_fault();`);
 await expect(run(()=>c.changeKnowledge({command,revision:doc.revision,draft,reviewToken:token}))).rejects.toThrow("LOCAL_KNOWLEDGE_AUDIT_FAULT");
 expect(JSON.stringify({doc:(await run(()=>c.readKnowledge())).document,rows:(await f.db.query('SELECT * FROM "AuditLog" ORDER BY id')).rows})).toBe(before);
},30_000);
it("does not accept Store/SYSTEM knowledge or another Brand principal",async()=>{
 const {f,c,run}=await setup();await expect(run(()=>c.changeKnowledge({command:"save",revision:0,draft:{...draft,references:{hours:true,services:false,prices:false}}}))).rejects.toThrow("OPERATIONAL_REFERENCE");
 await expect(run(()=>c.changeKnowledge({command:"save",revision:0,draft:{...draft,scope:"SYSTEM"}}))).rejects.toThrow();await expect(run(()=>c.changeKnowledge({command:"save",revision:0,draft,storeId:"ai-preview-beauty"}))).rejects.toThrow();
 await expect(f.runtime(()=>f.db.query('UPDATE "AiBrandKnowledgeDocument" SET draft=$1::jsonb WHERE "serviceId"=\'local-other-brand\' RETURNING *',[JSON.stringify(draft)]))).resolves.toMatchObject({rows:[]});
 expect((await f.db.query('SELECT * FROM "AiButlerKnowledgeDocument" ORDER BY "storeId"')).rows).toEqual(f.storeKnowledge);expect((await f.db.query('SELECT * FROM "AiBrandKnowledgeDocument" WHERE "serviceId"=\'local-other-brand\'')).rows).toEqual(f.otherBrand);expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(0);
},30_000);
