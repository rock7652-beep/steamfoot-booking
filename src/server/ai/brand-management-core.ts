import "server-only";
import { brandPreviewWriteWindow } from "../../../scripts/ai-brand-preview-write-window.mjs";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveEffectiveEntitlement, featurePresentationState } from "@/lib/effective-entitlement";
import { aiSettingSchema } from "./contracts";
import { aiKnowledgeDraftSchema } from "./knowledge-document";
import { aiHandoffReadSchema, aiHandoffResumeSchema, type AiHandoffSnapshot } from "./handoff-contract";
import { BRAND_PREVIEW_SERVICE, brandOperationSchema, type BrandOperation, type BrandManagementSnapshot } from "./brand-management-contract";
import { createBrandAi } from "./brand";
import { brandIdentity, type TrustedBrandScope } from "./principal";
import { projectBrandKnowledge, validateBrandDraft } from "./brand-knowledge";
import { MockAiProvider, assertAiInputBound } from "./provider";
import { AiOwnerRepository, type AiDatabase, type AiSql } from "./owner-repository";

type Actor = { id: string; role: string; auditAllowed: boolean; storeView: boolean };
type Ports = { database: AiDatabase; actor(): Promise<Actor>; assertPreview(): void; secret: string; env: Readonly<Record<string,string|undefined>>; clock?: () => Date };
/** Fixed principal. No caller-provided Store, service ID, module or channel. */
export function brandManagement(ports: Ports) {
  const now = ports.clock ?? (() => new Date());
  const hash = (value: unknown) => { if (ports.secret.length < 32) throw Error("AI_BRAND_IDENTITY_REQUIRED"); return createHmac("sha256", ports.secret).update(JSON.stringify(value)).digest("hex"); };
  const viewKey = (actor: Actor) => hash(["brand-management-v1", BRAND_PREVIEW_SERVICE, actor.id]);
  async function authorize(expected?: Actor) {
    ports.assertPreview();
    const actor = await ports.actor();
    if (!actor.id || actor.role !== "ADMIN" || !actor.auditAllowed || actor.storeView || (expected && actor.id !== expected.id)) throw Error("AI_BRAND_FORBIDDEN");
    return Object.freeze({ ...actor });
  }
  const scope = (actor: Actor): TrustedBrandScope => ({ principal: { kind: "BRAND", serviceId: BRAND_PREVIEW_SERVICE }, actorId: actor.id, channel: "TEST", channelAccountId: "brand-dashboard" });
  const repository = new AiOwnerRepository(ports.database, "BRAND");
  async function state(actor: Actor) {
    const [control] = await ports.database.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl" WHERE id=\'global\'');
    const [grant] = await ports.database.query<{ status: "HIDDEN"|"LOCKED"|"ENABLED"; startsAt: Date|null; expiresAt: Date|null }>('SELECT status,"startsAt","expiresAt" FROM "AiBrandGrant" WHERE "serviceId"=$1', [BRAND_PREVIEW_SERVICE]);
    if (!control || !grant || !["HIDDEN","LOCKED","ENABLED"].includes(grant.status)) throw Error("AI_BRAND_NOT_READY");
    const effective = featurePresentationState(resolveEffectiveEntitlement(false, { ...grant, startsAt: grant.startsAt ? new Date(grant.startsAt) : null, expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null }, now()));
    await authorize(actor);
    return { grant: grant.status, effectiveGrant: effective, globalStopped: control.stopped };
  }
  function writeWindow(operation: BrandOperation) {
    const window=brandPreviewWriteWindow(ports.env,now());
    return window.valid && window.operations.includes(operation);
  }
  async function writable(actor: Actor, operation: BrandOperation) {
    await authorize(actor);
    if (!writeWindow(operation)) throw Error("AI_BRAND_READ_ONLY");
    const current = await state(actor);
    if (current.effectiveGrant !== "ENABLED") throw Error("AI_NOT_ENTITLED");
    // Creating model events and enabling AI require a separate unlocked window.
    if (operation === "test" && current.globalStopped) throw Error("AI_GLOBAL_STOPPED");
  }
  async function mockCapacity(sql:AiSql,actor:Actor,eventId:string) {
    const start=new Date(Date.parse(ports.env.AI_BRAND_PREVIEW_WRITE_UNTIL??"")-30*60_000);
    const eventKey=brandIdentity(scope(actor),eventId,ports.secret).eventKey;
    const [row]=await sql.query<{used:number;duplicate:boolean}>('SELECT COUNT(*) FILTER(WHERE "createdAt">=$2)::int AS used,COALESCE(bool_or("eventKey"=$3),false) AS duplicate FROM "AiBrandRequest" WHERE "serviceId"=$1',[BRAND_PREVIEW_SERVICE,start,eventKey]);
    if(!row||typeof row.duplicate!=="boolean"||!Number.isSafeInteger(row.used)||row.used<0||(!row.duplicate&&row.used>=8))throw Error("AI_BRAND_TEST_LIMIT");
  }
  const mutationDatabase = (actor:Actor,operation:BrandOperation,commandKey?:string): AiDatabase => ({
    query: ports.database.query.bind(ports.database),
    transaction: work => ports.database.transaction(async tx => {
      // Same lock order as shared budget/settings: control first, then entitlement.
      await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      if(!writeWindow(operation))throw Error("AI_BRAND_READ_ONLY");
      const grant=await tx.query('SELECT 1 AS allowed FROM "AiBrandGrant" WHERE "serviceId"=$1 AND status=\'ENABLED\' AND ("startsAt" IS NULL OR "startsAt"<=$2) AND ("expiresAt" IS NULL OR "expiresAt">=$2)',[BRAND_PREVIEW_SERVICE,now()]);
      if(grant.length!==1)throw Error("AI_NOT_ENTITLED");
      const snapshotSql='SELECT jsonb_build_object(\'settingRevision\',s.revision,\'knowledgeRevision\',k.revision,\'publishedVersion\',k."publishedVersion",\'enabled\',s.setting->\'enabled\') AS snapshot FROM "AiBrandSetting" s JOIN "AiBrandKnowledgeDocument" k USING("serviceId") WHERE s."serviceId"=$1';
      if(operation==="test"&&commandKey)await mockCapacity(tx,actor,commandKey);
      const before=(await tx.query(snapshotSql,[BRAND_PREVIEW_SERVICE]))[0]?.snapshot;
      const result=await work(tx);
      const after=(await tx.query(snapshotSql,[BRAND_PREVIEW_SERVICE]))[0]?.snapshot;
      const summaries:Record<BrandOperation,string>={save:"儲存品牌知識草稿",publish:"發布已審核品牌知識",withdraw:"撤回品牌知識",setting:"更新品牌AI開關",handoff:"接手品牌測試對話",resume:"恢復品牌測試對話",test:"接受品牌Mock測試事件"};
      await tx.query(`INSERT INTO "AuditLog"(id,"actorUserId","actorRoleSnapshot",source,"storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt")
        VALUES($1,$2,'ADMIN','AI_BRAND_PREVIEW',NULL,'AI_BRAND','AiBrandService',$3,'UPDATE',$4,$5::jsonb,$6::jsonb,$7) ON CONFLICT(id) DO NOTHING`,
        [commandKey?"ai-brand-"+hash([actor.id,operation,commandKey]):randomUUID(),actor.id,BRAND_PREVIEW_SERVICE,summaries[operation],JSON.stringify(before??null),JSON.stringify({operation,state:after??null,...(operation==="handoff"?{scopeKey:brandIdentity(scope(actor),"operator",ports.secret).scopeKey}:{}),...(commandKey?{commandDigest:hash([operation,commandKey]),...(operation==="test"?{eventKey:brandIdentity(scope(actor),commandKey,ports.secret).eventKey}:{}),...(operation==="resume"?{handoffCommandKey:hash([viewKey(actor),commandKey])}:{})}:{})}),now()]);
      return result;
    }),
  });
  const app = (actor: Actor, operation?: BrandOperation,commandKey?:string) => createBrandAi({ serviceId: BRAND_PREVIEW_SERVICE, database: operation ? mutationDatabase(actor,operation,commandKey) : ports.database, identitySecret: ports.secret,
    provider: new MockAiProvider(), rateForModel: () => null, clock: now, enabled: () => ports.env.AI_DIGITAL_BUTLER_ENABLED === "1",
    authorize: async () => { await authorize(actor); },
    authorizeOperator: async operatorOperation => { if (!(operation==="resume"&&operatorOperation==="HANDOFF_RESUME")) await authorize(actor); if (["KNOWLEDGE_WRITE","SETTINGS_WRITE","HANDOFF_RESUME"].includes(operatorOperation) && !brandOperationSchema.options.filter(op=>op!=="test").some(writeWindow)) throw Error("AI_BRAND_READ_ONLY"); },
  });
  async function snapshot(): Promise<BrandManagementSnapshot> {
    const actor = await authorize(), client = app(actor);
    const [status, settings, document, usage, handoffs, synthetic, names] = await Promise.all([
      state(actor), client.settings.read(), client.knowledge.read(), repository.usage(BRAND_PREVIEW_SERVICE, now()), client.handoff.list(),
      repository.conversationState(brandIdentity(scope(actor), "read", ports.secret)),
      ports.database.query<{ name: string }>('SELECT svc.name FROM "AiBrandService" svc JOIN "AiBrandSetting" s ON s."serviceId"=svc.id JOIN "AiBrandGrant" g ON g."serviceId"=svc.id JOIN "AiBrandKnowledgeDocument" k ON k."serviceId"=svc.id WHERE svc.id=$1', [BRAND_PREVIEW_SERVICE]),
    ]);
    if (names.length !== 1) throw Error("AI_BRAND_NOT_READY");
    await authorize(actor);
    const capabilities = Object.fromEntries(brandOperationSchema.options.map(op => [op, status.effectiveGrant === "ENABLED" && writeWindow(op) && (op !== "test" || (!status.globalStopped && settings.setting.enabled))])) as Record<BrandOperation,boolean>;
    return { serviceId: BRAND_PREVIEW_SERVICE, name: names[0].name, viewKey: viewKey(actor), ...status, ...settings, document,
      usage: { requests: String(usage.requests), reservedMicros: String(usage.reservedMicros), budgetMicros: usage.budgetMicros, alerts: usage.alerts }, handoffs, synthetic, capabilities };
  }
  async function readKnowledge() { const actor = await authorize(); const document = await app(actor).knowledge.read(); await authorize(actor); return { success: true as const, document }; }
  async function reviewKnowledge(input: unknown) {
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).strict().parse(input);
    const actor = await authorize(), document = await app(actor).knowledge.read();
    if (document.revision !== revision) throw Error("AI_KNOWLEDGE_CONFLICT");
    validateBrandDraft(document.draft);
    const draft = { ...document, published: document.draft, publishedVersion: document.publishedVersion+1, publishedAt: now().toISOString() };
    const projected = projectBrandKnowledge(BRAND_PREVIEW_SERVICE, draft, now());
    if (!projected.records.length) throw Error("AI_KNOWLEDGE_EMPTY");
    assertAiInputBound({ model: "gpt-6-luna", message: "測".repeat(400), knowledge: projected.records, summary: Array(4).fill("SOURCE:"+"x".repeat(100)) });
    const expires = now().getTime()+5*60_000;
    const token = `${expires}.${hash([viewKey(actor), revision, document.draft, expires])}`;
    await authorize(actor);
    return { success: true as const, token, revision, sourceCount: projected.records.length };
  }
  async function changeKnowledge(input: unknown) {
    const data = z.object({ command: z.enum(["save","publish","withdraw"]), revision: z.number().int().nonnegative(), draft: aiKnowledgeDraftSchema.optional(), reviewToken: z.string().max(120).optional() }).strict().parse(input);
    const actor = await authorize(); await writable(actor, data.command);
    const client = app(actor,data.command);
    if (data.command === "publish") {
      const current = await client.knowledge.read();
      const [expires, signature] = (data.reviewToken ?? "").split(".");
      const expiry = Number(expires), expected = hash([viewKey(actor), data.revision, current.draft, expiry]);
      if (current.revision !== data.revision || !Number.isSafeInteger(expiry) || expiry<=now().getTime() || expiry-now().getTime()>5*60_000 || !/^[a-f0-9]{64}$/.test(signature ?? "") || !timingSafeEqual(Buffer.from(expected),Buffer.from(signature))) throw Error("AI_BRAND_REVIEW_REQUIRED");
    }
    const document = await client.knowledge.change(data.revision,data.command,data.draft,now());
    await authorize(actor); return { success: true as const, document };
  }
  async function saveSetting(input: unknown) {
    const data = z.object({ setting: aiSettingSchema, revision: z.number().int().nonnegative() }).strict().parse(input);
    const actor = await authorize(); await writable(actor,"setting");
    if (data.setting.enabled && (await state(actor)).globalStopped) throw Error("AI_GLOBAL_STOPPED");
    // UI cannot increase or reset the reviewed service limits through an enable toggle.
    const current = await app(actor).settings.read();
    if (JSON.stringify({ ...data.setting,enabled:false }) !== JSON.stringify({ ...current.setting,enabled:false })) throw Error("AI_BRAND_SETTING_SCOPE");
    const result = await app(actor,"setting").settings.save(data.setting,data.revision,now()); await authorize(actor);
    return { success:true as const,...result };
  }
  async function readHandoffs(input: unknown) {
    const data = aiHandoffReadSchema.parse(input), actor = await authorize();
    if (data.viewKey !== viewKey(actor)) throw Error("AI_HANDOFF_SCOPE_CHANGED");
    const s = await snapshot(), page = await app(actor).handoff.list(data.cursor); await authorize(actor);
    const result: AiHandoffSnapshot = { viewKey: data.viewKey, page, cursor: data.cursor, synthetic: s.synthetic, routing: { ...s.synthetic,globalStopped:s.globalStopped } };
    return { success:true as const,snapshot:result };
  }
  async function resume(input: unknown) {
    const data=aiHandoffResumeSchema.parse(input), actor=await authorize(); await writable(actor,"resume");
    if(data.viewKey!==viewKey(actor))throw Error("AI_HANDOFF_SCOPE_CHANGED");
    const result=await app(actor,"resume",data.commandId).handoff.resume({scopeKey:data.scopeKey,revision:data.revision,actorKey:hash(["brand-operator",BRAND_PREVIEW_SERVICE,actor.id]),commandKey:hash([data.viewKey,data.commandId])},now(),async()=>{if(!writeWindow("resume"))throw Error("AI_BRAND_READ_ONLY");});
    return { duplicate:result.duplicate,...await readHandoffs({viewKey:data.viewKey,cursor:data.cursor}) };
  }
  async function setHandoff(value: unknown) {
    const handoff=z.boolean().parse(value),actor=await authorize(); await writable(actor,"handoff");
    if (!handoff) throw Error("AI_BRAND_AUDITED_RESUME_REQUIRED");
    const revision=await new AiOwnerRepository(mutationDatabase(actor,"handoff"),"BRAND").handoff(brandIdentity(scope(actor),"operator",ports.secret),handoff,now()); await authorize(actor);
    return {success:true as const,revision};
  }
  async function test(input: unknown) {
    const data=z.object({eventId:z.string().uuid(),question:z.string().trim().min(1).max(400),provider:z.literal("mock")}).strict().parse(input);
    const actor=await authorize();await writable(actor,"test");await mockCapacity(ports.database,actor,data.eventId);
    const client=app(actor,"test",data.eventId),reload=async()=>projectBrandKnowledge(BRAND_PREVIEW_SERVICE,await client.knowledge.read(),now()),published=await reload();
    const result=await client.service.respond(scope(actor),data.eventId,data.question,published.records,{snapshot:published,reload});
    await authorize(actor); return {success:true as const,result,usage:await repository.usage(BRAND_PREVIEW_SERVICE,now())};
  }
  return {assertAccess:authorize,snapshot,readKnowledge,reviewKnowledge,changeKnowledge,saveSetting,readHandoffs,resume,setHandoff,test};
}
