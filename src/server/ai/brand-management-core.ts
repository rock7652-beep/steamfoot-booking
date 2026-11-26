import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
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
import { AiOwnerRepository, type AiDatabase } from "./owner-repository";

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
    const end = Date.parse(ports.env.AI_BRAND_PREVIEW_WRITE_UNTIL ?? ""), current = now().getTime();
    const list = (ports.env.AI_BRAND_PREVIEW_WRITE_OPERATIONS ?? "").split(",");
    return Number.isFinite(end) && end>current && end-current<=30*60_000 && list.includes(operation);
  }
  async function writable(actor: Actor, operation: BrandOperation) {
    await authorize(actor);
    if (!writeWindow(operation)) throw Error("AI_BRAND_READ_ONLY");
    const current = await state(actor);
    if (current.effectiveGrant !== "ENABLED") throw Error("AI_NOT_ENTITLED");
    // Creating model events and enabling AI require a separate unlocked window.
    if (operation === "test" && current.globalStopped) throw Error("AI_GLOBAL_STOPPED");
  }
  const mutationDatabase = (operation: "save"|"publish"|"withdraw"): AiDatabase => ({
    query: ports.database.query.bind(ports.database),
    transaction: work => ports.database.transaction(async tx => {
      // Same lock order as shared budget/settings: control first, then entitlement.
      await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      if(!writeWindow(operation))throw Error("AI_BRAND_READ_ONLY");
      const grant=await tx.query('SELECT 1 AS allowed FROM "AiBrandGrant" WHERE "serviceId"=$1 AND status=\'ENABLED\' AND ("startsAt" IS NULL OR "startsAt"<=$2) AND ("expiresAt" IS NULL OR "expiresAt">=$2)',[BRAND_PREVIEW_SERVICE,now()]);
      if(grant.length!==1)throw Error("AI_NOT_ENTITLED");
      return work(tx);
    }),
  });
  const app = (actor: Actor, operation?: "save"|"publish"|"withdraw") => createBrandAi({ serviceId: BRAND_PREVIEW_SERVICE, database: operation ? mutationDatabase(operation) : ports.database, identitySecret: ports.secret,
    provider: new MockAiProvider(), rateForModel: () => null, clock: now, enabled: () => ports.env.AI_DIGITAL_BUTLER_ENABLED === "1",
    authorize: async () => { await authorize(actor); },
    authorizeOperator: async operation => { await authorize(actor); if (["KNOWLEDGE_WRITE","SETTINGS_WRITE","HANDOFF_RESUME"].includes(operation) && !brandOperationSchema.options.filter(op=>op!=="test").some(writeWindow)) throw Error("AI_BRAND_READ_ONLY"); },
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
    const capabilities = Object.fromEntries(brandOperationSchema.options.map(op => [op, status.effectiveGrant === "ENABLED" && writeWindow(op) && (op !== "test" || !status.globalStopped)])) as Record<BrandOperation,boolean>;
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
    const result = await app(actor).settings.save(data.setting,data.revision,now()); await authorize(actor);
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
    const result=await app(actor).handoff.resume({scopeKey:data.scopeKey,revision:data.revision,actorKey:hash(["brand-operator",BRAND_PREVIEW_SERVICE,actor.id]),commandKey:hash([data.viewKey,data.commandId])},now(),async()=>{await writable(actor,"resume");});
    return { duplicate:result.duplicate,...await readHandoffs({viewKey:data.viewKey,cursor:data.cursor}) };
  }
  async function setHandoff(value: unknown) {
    const handoff=z.boolean().parse(value),actor=await authorize(); await writable(actor,"handoff");
    if (!handoff) throw Error("AI_BRAND_AUDITED_RESUME_REQUIRED");
    const revision=await repository.handoff(brandIdentity(scope(actor),"operator",ports.secret),handoff,now()); await authorize(actor);
    return {success:true as const,revision};
  }
  async function test(input: unknown) {
    const data=z.object({eventId:z.string().uuid(),question:z.string().trim().min(1).max(400),provider:z.literal("mock")}).strict().parse(input);
    const actor=await authorize();await writable(actor,"test");
    const client=app(actor),reload=async()=>projectBrandKnowledge(BRAND_PREVIEW_SERVICE,await client.knowledge.read(),now()),published=await reload();
    const result=await client.service.respond(scope(actor),data.eventId,data.question,published.records,{snapshot:published,reload});
    await authorize(actor); return {success:true as const,result,usage:await repository.usage(BRAND_PREVIEW_SERVICE,now())};
  }
  return {assertAccess:authorize,snapshot,readKnowledge,reviewKnowledge,changeKnowledge,saveSetting,readHandoffs,resume,setHandoff,test};
}
