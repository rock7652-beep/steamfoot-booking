import {afterEach,expect,it} from "vitest";
import {brandManagement} from "@/server/ai/brand-management-core";
import {createBrandToggleFixture} from "../../scripts/qa/ai-brand-toggle-fixture.mjs";
let fixture:Awaited<ReturnType<typeof createBrandToggleFixture>>|undefined;
afterEach(async()=>{await fixture?.db.close();fixture=undefined;});
async function setup(){
 const f=fixture=await createBrandToggleFixture();await f.prepare();
 const env={AI_BRAND_PREVIEW_WRITE_OPERATIONS:"setting",AI_BRAND_PREVIEW_WRITE_UNTIL:f.end};
 const create=(database=f.database)=>brandManagement({database,actor:f.actor,assertPreview:()=>{},secret:"offline-toggle-only-identity-secret-123456",env});
 return {f,create,env};
}
it("matches live toggle columns, both audit triggers, RLS and verified actor while enabling and disabling",async()=>{
 const {f,create}=await setup();expect(await f.verifySchema()).toMatchObject({columnsMatched:83,triggersMatched:2,functionBodiesMatched:3});
 await f.db.exec('UPDATE "AiButlerControl" SET stopped=false WHERE id=\'global\'');const c=create(),before=await f.runtime(()=>c.snapshot());
 const on=await f.runtime(()=>c.saveSetting({setting:{...before.setting,enabled:true},revision:before.revision}));expect(on.setting.enabled).toBe(true);
 expect((await f.runtime(()=>create().snapshot())).setting.enabled).toBe(true);
 await f.db.exec('UPDATE "AiButlerControl" SET stopped=true WHERE id=\'global\'');
 const off=await f.runtime(()=>create().saveSetting({setting:{...on.setting,enabled:false},revision:on.revision}));expect(off.setting.enabled).toBe(false);
 expect((await f.runtime(()=>create().snapshot())).setting.enabled).toBe(false);
 const audits=(await f.db.query<{actorUserId:string;actorRoleSnapshot:string;actorNameSnapshot:string;loginRecordId:string;storeId:string|null;beforeJson:unknown;afterJson:unknown}>('SELECT "actorUserId","actorRoleSnapshot","actorNameSnapshot","loginRecordId","storeId","beforeJson","afterJson" FROM "AuditLog" ORDER BY "createdAt",id')).rows;
 expect(audits).toHaveLength(2);expect(audits.every(r=>r.actorUserId===f.uid&&r.actorRoleSnapshot==="ADMIN"&&r.loginRecordId==="local-brand-login"&&r.storeId===null)).toBe(true);
 expect((await f.db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"')).rows).toEqual(f.initialStores);
},20_000);
it("rechecks global stop under the transaction lock before enabling",async()=>{
 const {f,create}=await setup();await f.db.exec('UPDATE "AiButlerControl" SET stopped=false');
 const c=create({...f.database,transaction:async work=>{await f.db.exec('UPDATE "AiButlerControl" SET stopped=true');return f.database.transaction(work);}});
 const s=await f.runtime(()=>c.snapshot());await expect(f.runtime(()=>c.saveSetting({setting:{...s.setting,enabled:true},revision:s.revision}))).rejects.toThrow("AI_GLOBAL_STOPPED");
 expect((await f.db.query('SELECT setting,revision FROM "AiBrandSetting" WHERE "serviceId"=$1',[f.sid])).rows[0]).toMatchObject({setting:{enabled:false},revision:1});
 expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(0);
},20_000);
it("rolls back both the setting and audit when a real PostgreSQL append trigger fails",async()=>{
 const {f,create}=await setup();await f.db.exec('UPDATE "AiButlerControl" SET stopped=false');
 await f.db.exec(`CREATE FUNCTION local_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_AUDIT_APPEND_FAULT'; END $$;CREATE TRIGGER zz_local_audit_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION local_audit_fault();`);
 const c=create(),s=await f.runtime(()=>c.snapshot());await expect(f.runtime(()=>c.saveSetting({setting:{...s.setting,enabled:true},revision:s.revision}))).rejects.toThrow("LOCAL_AUDIT_APPEND_FAULT");
 expect((await f.db.query('SELECT setting,revision FROM "AiBrandSetting" WHERE "serviceId"=$1',[f.sid])).rows[0]).toMatchObject({setting:{enabled:false},revision:1});expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(0);
},20_000);
it("denies missing helper, expired window, locked grant and quota edits without a partial toggle",async()=>{
 const {f,create,env}=await setup();await f.db.exec('UPDATE "AiButlerControl" SET stopped=false');const c=create(),s=await f.runtime(()=>c.snapshot()),input={setting:{...s.setting,enabled:true},revision:s.revision};
 await f.db.exec(`REVOKE EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) FROM ${f.role}`);await expect(f.runtime(()=>c.saveSetting(input))).rejects.toThrow("AUDIT_NOT_READY");await f.db.exec(`GRANT EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) TO ${f.role}`);
 const end=env.AI_BRAND_PREVIEW_WRITE_UNTIL;env.AI_BRAND_PREVIEW_WRITE_UNTIL="2000-01-01T00:00:00Z";await expect(f.runtime(()=>c.saveSetting(input))).rejects.toThrow("READ_ONLY");env.AI_BRAND_PREVIEW_WRITE_UNTIL=end;
 await f.db.exec('UPDATE "AiBrandGrant" SET status=\'LOCKED\'');await expect(f.runtime(()=>c.saveSetting(input))).rejects.toThrow("NOT_ENTITLED");await f.db.exec('UPDATE "AiBrandGrant" SET status=\'ENABLED\'');
 await expect(f.runtime(()=>c.saveSetting({...input,setting:{...input.setting,dailyRequests:21}}))).rejects.toThrow("SETTING_SCOPE");
 expect((await f.db.query('SELECT setting,revision FROM "AiBrandSetting" WHERE "serviceId"=$1',[f.sid])).rows[0]).toMatchObject({setting:{enabled:false,dailyRequests:20},revision:1});expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(0);
},20_000);
it("a repeated stale toggle cannot flip back or append a second audit",async()=>{
 const {f,create}=await setup();await f.db.exec('UPDATE "AiButlerControl" SET stopped=false');const c=create(),s=await f.runtime(()=>c.snapshot()),input={setting:{...s.setting,enabled:true},revision:s.revision};
 await f.runtime(()=>c.saveSetting(input));await expect(f.runtime(()=>c.saveSetting(input))).rejects.toThrow("SETTING_CONFLICT");
 expect((await f.db.query('SELECT setting,revision FROM "AiBrandSetting" WHERE "serviceId"=$1',[f.sid])).rows[0]).toMatchObject({setting:{enabled:true},revision:2});expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(1);
},20_000);
it("the actual User RLS dependency rolls back a toggle from a stale suspended actor",async()=>{
 const {f}=await setup();await f.db.exec('UPDATE "AiButlerControl" SET stopped=false');
 const c=brandManagement({database:f.database,actor:async()=>({id:f.uid,role:"ADMIN",auditAllowed:true,storeView:false}),assertPreview:()=>{},secret:"offline-toggle-only-identity-secret-123456",env:{AI_BRAND_PREVIEW_WRITE_OPERATIONS:"setting",AI_BRAND_PREVIEW_WRITE_UNTIL:f.end}}),s=await f.runtime(()=>c.snapshot());
 await f.db.query('UPDATE "User" SET status=\'SUSPENDED\' WHERE id=$1',[f.uid]);await expect(f.runtime(()=>c.saveSetting({setting:{...s.setting,enabled:true},revision:s.revision}))).rejects.toThrow();
 expect((await f.db.query('SELECT setting,revision FROM "AiBrandSetting" WHERE "serviceId"=$1',[f.sid])).rows[0]).toMatchObject({setting:{enabled:false},revision:1});expect((await f.db.query('SELECT * FROM "AuditLog"')).rows).toHaveLength(0);
},20_000);
