import "server-only";
import { ownerDatabase, type AiStorageKind } from "./owner-storage";
import { AI_LIMITS, aiSettingSchema, DEFAULT_AI_SETTING, type AiSetting, type AiModel } from "./contracts";
import { dayRange, monthRange, toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";

export interface AiSql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
}
export interface AiDatabase extends AiSql { transaction<T>(work: (tx: AiSql) => Promise<T>): Promise<T> }
export type AiOwnerIdentity = { ownerId: string; scopeKey: string; eventKey: string };
export type AiOwnerReservation = AiOwnerIdentity & { model: AiModel; heldMicros: number; provider: "mock" | "openai"; now: Date; expectedConversationRevision?: number };
const scoped = (id: AiOwnerIdentity) => {
  if (!id.ownerId || id.ownerId === "__all__" || !/^[a-f0-9]{64}$/.test(id.scopeKey) || !/^[a-f0-9]{64}$/.test(id.eventKey)) throw new Error("AI_SCOPE_INVALID");
};
const lock = async (tx: AiSql) => {
  const rows = await tx.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
  if (rows.length !== 1 || rows[0].stopped) throw new Error("AI_GLOBAL_STOPPED");
};
async function entitled(tx: AiSql, ownerId: string, now?: Date) {
  const rows = await tx.query('SELECT 1 AS allowed FROM "StoreFeatureEntitlement" WHERE "ownerId"=$1 AND "featureKey"=\'ai_digital_butler\' AND status=\'ENABLED\' AND ("startsAt" IS NULL OR "startsAt" <= COALESCE($2::timestamptz,CURRENT_TIMESTAMP)) AND ("expiresAt" IS NULL OR "expiresAt" >= COALESCE($2::timestamptz,CURRENT_TIMESTAMP))', [ownerId, now ?? null]);
  if (rows.length !== 1) throw new Error("AI_NOT_ENTITLED");
}
export { entitled as assertAiOwnerEntitlement };
export class AiOwnerRepository {
  readonly db: AiDatabase;
  constructor(database: AiDatabase, kind: AiStorageKind) { this.db = ownerDatabase(database, kind); }
  async setting(ownerId: string): Promise<{ setting: AiSetting; revision: number }> {
    if (!ownerId || ownerId === "__all__") throw new Error("AI_SCOPE_REQUIRED");
    const rows = await this.db.query<{ setting: unknown; revision: number }>('SELECT setting, revision FROM "AiButlerSetting" WHERE "ownerId"=$1', [ownerId]);
    return rows[0] ? { setting: aiSettingSchema.parse(rows[0].setting), revision: rows[0].revision } : { setting: DEFAULT_AI_SETTING, revision: 0 };
  }
  async saveSetting(ownerId: string, value: AiSetting, revision: number, now: Date) {
    const setting = aiSettingSchema.parse(value);
    if (!Number.isSafeInteger(revision) || revision < 0 || setting.channels.some(channel => channel !== "TEST")) throw new Error("AI_TEST_CHANNEL_ONLY");
    await this.db.transaction(async tx => {
      // Settings can be disabled while global stop is set.
      await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      await entitled(tx, ownerId, now);
      const existing = await tx.query('SELECT revision FROM "AiButlerSetting" WHERE "ownerId"=$1', [ownerId]);
      if (!existing.length && revision === 0) {
        await tx.query('INSERT INTO "AiButlerSetting" ("ownerId", setting, revision) VALUES ($1,$2::jsonb,1)', [ownerId, JSON.stringify(setting)]);
      } else {
        const changed = await tx.query('UPDATE "AiButlerSetting" SET setting=$2::jsonb, revision=revision+1 WHERE "ownerId"=$1 AND revision=$3 RETURNING revision', [ownerId, JSON.stringify(setting), revision]);
        if (changed.length !== 1) throw new Error("AI_SETTING_CONFLICT");
      }
    });
    return this.setting(ownerId);
  }
  async reserve(input: AiOwnerReservation, channel: string): Promise<{ duplicate: boolean; summary: string[]; conversationRevision: number }> {
    scoped(input);
    if (!Number.isSafeInteger(input.heldMicros) || input.heldMicros < 0 || (input.provider === "openai" && input.heldMicros === 0)) throw new Error("AI_RESERVATION_INVALID");
    return this.db.transaction(async tx => {
      await lock(tx);
      await entitled(tx, input.ownerId, input.now);
      const duplicate = await tx.query('SELECT 1 FROM "AiButlerRequest" WHERE "ownerId"=$1 AND "eventKey"=$2', [input.ownerId, input.eventKey]);
      if (duplicate.length) return { duplicate: true, summary: [], conversationRevision: 0 };
      const rows = await tx.query<{ setting: unknown }>('SELECT setting FROM "AiButlerSetting" WHERE "ownerId"=$1', [input.ownerId]);
      const setting = aiSettingSchema.parse(rows[0]?.setting ?? DEFAULT_AI_SETTING);
      if (!setting.enabled || !setting.channels.includes(channel as never) || setting.model !== input.model) throw new Error("AI_STORE_DISABLED");
      const conversation = await tx.query<{ handoff: boolean; summary: string[]; expiresAt: Date; revision: number }>('SELECT handoff, summary, "expiresAt",revision FROM "AiButlerConversation" WHERE "ownerId"=$1 AND "scopeKey"=$2', [input.ownerId, input.scopeKey]);
      if (input.expectedConversationRevision !== undefined && (conversation[0]?.revision ?? 0) !== input.expectedConversationRevision) throw new Error("AI_SCOPE_CHANGED");
      // Handoff never resumes on a timer. A trusted operator must explicitly resume.
      if (conversation[0]?.handoff) throw new Error("AI_HUMAN_HANDOFF");
      const day = dayRange(toLocalDateStr(input.now)), month = monthRange(toLocalMonthStr(input.now));
      const totals = (await tx.query<{ total: string; monthly: string; dailyCount: string; monthlyCount: string; concurrent: string; storeConcurrent: string }>(`
        SELECT COALESCE(SUM("heldMicros"),0)::text AS total,
          COALESCE(SUM("heldMicros") FILTER (WHERE "ownerId"=$1 AND "createdAt">=$3 AND "createdAt"<=$4),0)::text AS monthly,
          COUNT(*) FILTER (WHERE "ownerId"=$1 AND "createdAt">=$2 AND "createdAt"<=$5)::text AS "dailyCount",
          COUNT(*) FILTER (WHERE "ownerId"=$1 AND "createdAt">=$3 AND "createdAt"<=$4)::text AS "monthlyCount",
          COUNT(*) FILTER (WHERE status='RESERVED')::text AS concurrent,
          COUNT(*) FILTER (WHERE status='RESERVED' AND "ownerId"=$1)::text AS "storeConcurrent"
        FROM "AiButlerRequest"`, [input.ownerId, day.start, month.start, month.end, day.end]))[0];
      const [peer] = await tx.query<{ total: string; concurrent: string }>("/* AI_GLOBAL_TOTALS */", [totals.total, totals.concurrent]);
      if (!peer) throw new Error("AI_BUDGET_UNKNOWN");
      totals.total = peer.total;
      totals.concurrent = peer.concurrent;
      const values = Object.values(totals).map(Number);
      if (values.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("AI_BUDGET_UNKNOWN");
      if (Number(totals.total) + input.heldMicros > AI_LIMITS.globalBudgetMicros
        || Number(totals.monthly) + input.heldMicros > setting.monthlyBudgetMicros) throw new Error("AI_BUDGET_EXCEEDED");
      if (Number(totals.dailyCount) >= setting.dailyRequests || Number(totals.monthlyCount) >= setting.monthlyRequests) throw new Error("AI_REQUEST_LIMIT");
      if (Number(totals.concurrent) >= AI_LIMITS.globalConcurrency || Number(totals.storeConcurrent) >= AI_LIMITS.storeConcurrency) throw new Error("AI_CONCURRENCY_LIMIT");
      await tx.query('INSERT INTO "AiButlerRequest" ("ownerId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES ($1,$2,$3,$4,$5,\'RESERVED\',$6,$7)', [input.ownerId, input.eventKey, input.scopeKey, input.provider, input.model, input.heldMicros, input.now]);
      const summary = conversation[0] && new Date(conversation[0].expiresAt) > input.now ? conversation[0].summary : [];
      return { duplicate: false, conversationRevision: conversation[0]?.revision ?? 0, summary: Array.isArray(summary) ? summary.filter(s => typeof s === "string" && s.length < 120).slice(-AI_LIMITS.historyTurns) : [] };
    });
  }
  async settle(input: AiOwnerIdentity, result: { cost: number; inputTokens: number; outputTokens: number; latencyMs: number; handoff: boolean; summary: string; overrun: boolean; conversationRevision: number; channel?: import("./contracts").AiChannel }, now: Date): Promise<boolean> {
    scoped(input);
    return this.db.transaction(async tx => {
      const controls = await tx.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      const rows = await tx.query('SELECT status FROM "AiButlerRequest" WHERE "ownerId"=$1 AND "eventKey"=$2', [input.ownerId, input.eventKey]);
      if (rows[0]?.status !== "RESERVED") return false;
      let allowed = controls.length === 1 && !controls[0].stopped;
      try { await entitled(tx, input.ownerId, now); } catch { allowed = false; }
      const settings = await tx.query<{ setting: unknown }>('SELECT setting FROM "AiButlerSetting" WHERE "ownerId"=$1', [input.ownerId]);
      const currentSetting = aiSettingSchema.safeParse(settings[0]?.setting);
      allowed = allowed && currentSetting.success && currentSetting.data.enabled && (!result.channel || currentSetting.data.channels.includes(result.channel));
      const prior = await tx.query<{ handoff: boolean; summary: string[]; revision: number }>('SELECT handoff, summary,revision FROM "AiButlerConversation" WHERE "ownerId"=$1 AND "scopeKey"=$2', [input.ownerId, input.scopeKey]);
      allowed = allowed && !prior[0]?.handoff && (prior[0]?.revision ?? 0) === result.conversationRevision && !result.overrun;
      if (result.overrun) await tx.query('UPDATE "AiButlerControl" SET stopped=true WHERE id=\'global\'');
      await tx.query(`UPDATE "AiButlerRequest" SET status=$3, "estimatedMicros"=$4,
        "heldMicros"=CASE WHEN $9 THEN GREATEST("heldMicros",$4) ELSE $4 END,
        "inputTokens"=$5,"outputTokens"=$6,"latencyMs"=$7,outcome=$8,"finishedAt"=$10
        WHERE "ownerId"=$1 AND "eventKey"=$2`, [input.ownerId, input.eventKey, allowed ? "COMPLETE" : "SUPPRESSED", result.cost, result.inputTokens, result.outputTokens, result.latencyMs, result.overrun ? "TOKEN_OR_COST_OVERRUN" : allowed ? (result.handoff ? "HANDOFF" : "ANSWER") : "SUPPRESSED", result.overrun, now]);
      if (allowed) {
        const summary = [...(prior[0]?.summary ?? []), result.summary].slice(-AI_LIMITS.historyTurns);
        await tx.query(`INSERT INTO "AiButlerConversation" ("ownerId","scopeKey",handoff,summary,"expiresAt",revision) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
          ON CONFLICT ("ownerId","scopeKey") DO UPDATE SET handoff=EXCLUDED.handoff,summary=EXCLUDED.summary,"expiresAt"=EXCLUDED."expiresAt",revision=EXCLUDED.revision`, [input.ownerId, input.scopeKey, result.handoff, JSON.stringify(summary), new Date(now.getTime() + AI_LIMITS.retentionDays * 86400_000), result.conversationRevision + (result.handoff ? 1 : 0)]);
      }
      return allowed;
    });
  }
  async unknown(input: AiOwnerIdentity, now: Date) {
    scoped(input);
    // Keep the entire reservation, even if the provider returned a 4xx or timed out.
    await this.db.transaction(async tx => {
      await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      const changed = await tx.query('UPDATE "AiButlerRequest" SET status=\'UNKNOWN\',outcome=\'PROVIDER_OR_SETTLEMENT_UNKNOWN\',"finishedAt"=$3 WHERE "ownerId"=$1 AND "eventKey"=$2 AND status=\'RESERVED\' RETURNING "eventKey"', [input.ownerId, input.eventKey, now]);
      if (changed.length) await tx.query(`INSERT INTO "AiButlerConversation" ("ownerId","scopeKey",handoff,"expiresAt",revision) VALUES ($1,$2,true,$3,1)
        ON CONFLICT ("ownerId","scopeKey") DO UPDATE SET handoff=true,summary='[]',revision="AiButlerConversation".revision+1`, [input.ownerId, input.scopeKey, new Date(now.getTime() + AI_LIMITS.retentionDays * 86400_000)]);
    });
  }
  async handoff(input: Pick<AiOwnerIdentity, "ownerId" | "scopeKey">, value: boolean, now: Date) {
    return this.db.transaction(async tx => {
      await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
      await entitled(tx, input.ownerId, now);
      const changed = await tx.query<{ revision: number }>(`INSERT INTO "AiButlerConversation" ("ownerId","scopeKey",handoff,"expiresAt",revision) VALUES ($1,$2,$3,$4,1)
        ON CONFLICT ("ownerId","scopeKey") DO UPDATE SET handoff=$3,summary='[]',"expiresAt"=$4,revision="AiButlerConversation".revision+1 RETURNING revision`, [input.ownerId, input.scopeKey, value, new Date(now.getTime() + AI_LIMITS.retentionDays * 86400_000)]);
      return changed[0].revision;
    });
  }
  async conversationState(input: Pick<AiOwnerIdentity, "ownerId" | "scopeKey">) {
    const rows = await this.db.query<{ handoff: boolean; revision: number }>('SELECT handoff,revision FROM "AiButlerConversation" WHERE "ownerId"=$1 AND "scopeKey"=$2', [input.ownerId, input.scopeKey]);
    return { handoff: rows[0]?.handoff ?? false, revision: rows[0]?.revision ?? 0 };
  }
  async usage(ownerId: string, now: Date) {
    const month = monthRange(toLocalMonthStr(now));
    const rows = await this.db.query<{ requests: string; reservedMicros: string; errors: string; handoffs: string; inputTokens: string; outputTokens: string; meanLatencyMs: string | null }>(`
      SELECT COUNT(*)::text AS requests,COALESCE(SUM("heldMicros"),0)::text AS "reservedMicros",
        COUNT(*) FILTER (WHERE status='UNKNOWN' OR outcome='TOKEN_OR_COST_OVERRUN')::text AS errors,
        COUNT(*) FILTER (WHERE outcome='HANDOFF')::text AS handoffs,
        COALESCE(SUM("inputTokens"),0)::text AS "inputTokens",COALESCE(SUM("outputTokens"),0)::text AS "outputTokens",
        AVG("latencyMs")::text AS "meanLatencyMs" FROM "AiButlerRequest" WHERE "ownerId"=$1 AND "createdAt">=$2 AND "createdAt"<=$3`, [ownerId, month.start, month.end]);
    const usage = rows[0];
    const setting = await this.setting(ownerId);
    return { ...usage, budgetMicros: setting.setting.monthlyBudgetMicros,
      alerts: AI_LIMITS.alertPercentages.filter(p => Number(usage.reservedMicros) >= setting.setting.monthlyBudgetMicros * p / 100) };
  }
}
