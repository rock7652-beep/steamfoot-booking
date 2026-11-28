import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DEVELOPMENT_DAILY_LIMIT } from "./checkpoint";

// Infrastructure only. No product tables, Production credentials or LINE API.
export type Campaign = {
  id: string;
  batchId: string;
  phase: "initial" | "retest";
  sha: string;
  corpusHash: string;
  model: "gpt-6-luna";
  maxCalls: number;
  budgetMicros: number;
  caseMicros: number;
  caseCount: number;
  notBeforeDay?: string;
  caseIds?: string[];
};
export type Ledger = {
  calls: { id: string; attempt: number; day: string }[];
  results: { id: string; state: string; codes: string[] }[];
  haltReason?: string;
  [key: string]: unknown;
};
export type SharedState = {
  version: 1;
  genesisRun?: string;
  lastRun: string | null;
  days: Record<string, number>;
  batches: Record<string, {
    budgetMicros: number;
    calls: number;
    micros: number;
    initial: number;
    retest: number;
    halt?: string;
  }>;
  campaigns: Record<string, {
    grantHash: string;
    calls: number;
    micros: number;
    ledger: Ledger | null;
    halt?: string;
  }>;
  lease?: {
    run: string;
    campaign: string;
    batch: string;
    phase: "initial" | "retest";
    day: string;
    calls: number;
    micros: number;
    priorCalls: number;
  };
};
export const blankState = (): SharedState => ({
  version: 1, lastRun: null, days: {}, batches: {}, campaigns: {},
});
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const grantHash = (grant: Campaign) => digest(JSON.stringify(grant));
export function requireOriginalRun(run: { status: string; run_attempt: number }) {
  if (run.status !== "completed") throw Error("OTHER_RUN_NOT_COMPLETE");
  // Check BEFORE inspecting latest-attempt jobs: a rejected rerun must not hide
  // a previous attempt that already consumed a durable reservation.
  if (run.run_attempt !== 1) throw Error("PREVIOUS_RUN_REPLAY_REQUIRES_REVIEW");
}
export function requireContinuousHistory(genesis: number, current: number, numbers: number[]) {
  if (!Number.isInteger(genesis) || !Number.isInteger(current) || current < genesis ||
      current - genesis > 10000 || numbers.some((n) => n > current))
    throw Error("RUN_HISTORY_NOT_STABLE");
  const present = new Set(numbers);
  for (let n = genesis; n <= current; n++) {
    if (!present.has(n)) throw Error("RUN_HISTORY_GAP_NO_ROLLBACK");
  }
}
function keyBytes(key: string) {
  const normalized = key.trim();
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw Error("STATE_KEY_FORMAT");
  return Buffer.from(normalized, "hex");
}
export function seal(state: SharedState, key: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"), data: data.toString("base64") });
}
export function unseal(input: string, key: string, context: string): SharedState {
  const envelope = JSON.parse(input);
  if (envelope.version !== 1) throw Error("STATE_VERSION");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(envelope.iv, "hex"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
  const state = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")), decipher.final(),
  ]).toString("utf8"));
  if (state.version !== 1 || !state.days || !state.batches || !state.campaigns)
    throw Error("STATE_INVALID_NO_RESET");
  return state;
}
export function validateGrant(grant: Campaign) {
  if (!/^[a-z0-9-]{1,60}$/.test(grant.id) || !/^[a-f0-9]{40}$/.test(grant.sha) ||
      !/^[a-z0-9-]{1,60}$/.test(grant.batchId) ||
      !["initial", "retest"].includes(grant.phase) ||
      !/^[a-f0-9]{64}$/.test(grant.corpusHash) || grant.model !== "gpt-6-luna" ||
      !Number.isInteger(grant.maxCalls) || grant.maxCalls < 2 ||
      grant.maxCalls > (grant.phase === "initial" ? 70 : 30) ||
      !Number.isInteger(grant.budgetMicros) || grant.budgetMicros < 1 || grant.budgetMicros > 1000000 ||
      !Number.isInteger(grant.caseCount) || grant.caseCount < 1 || grant.caseCount > 35 ||
      grant.caseMicros !== 2256 ||
      (grant.caseIds !== undefined && (grant.caseIds.length !== grant.caseCount ||
        new Set(grant.caseIds).size !== grant.caseIds.length ||
        grant.caseIds.some((id) => !/^[A-Za-z0-9-]{1,60}$/.test(id)))) ||
      (grant.notBeforeDay !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(grant.notBeforeDay)))
    throw Error("GRANT_NOT_APPROVED");
}
export function reserveBatch(
  previous: SharedState, grant: Campaign, run: string, day: string,
  untilDayEndMs: number,
) {
  validateGrant(grant);
  const state: SharedState = structuredClone(previous);
  if (state.lease) throw Error("INTERRUPTED_RESERVATION_RECONCILE_NO_REFUND");
  if (state.lastRun === run) throw Error("RUN_ALREADY_USED");
  let campaign = state.campaigns[grant.id];
  if (!campaign) {
    campaign = state.campaigns[grant.id] = {
      grantHash: grantHash(grant), calls: 0, micros: 0, ledger: null,
    };
  }
  if (campaign.grantHash !== grantHash(grant)) throw Error("GRANT_CHANGED_NO_RESET");
  if (campaign.halt) throw Error("CAMPAIGN_REQUIRES_REVIEW");
  const batch = state.batches[grant.batchId] ??= {
    budgetMicros: grant.budgetMicros, calls: 0, micros: 0, initial: 0, retest: 0,
  };
  if (batch.budgetMicros !== grant.budgetMicros) throw Error("BATCH_BUDGET_CHANGED_NO_RESET");
  if (batch.halt) throw Error("BATCH_REQUIRES_REVIEW");
  const used = state.days[day] ?? 0;
  const completed = campaign.ledger?.results.length ?? 0;
  const pairs = untilDayEndMs < 15000 || (grant.notBeforeDay && day < grant.notBeforeDay) ? 0 : Math.max(0, Math.min(
    Math.floor((DEVELOPMENT_DAILY_LIMIT - used) / 2),
    Math.floor((grant.maxCalls - campaign.calls) / 2),
    Math.floor((100 - batch.calls) / 2),
    Math.floor(((grant.phase === "initial" ? 70 : 30) - batch[grant.phase]) / 2),
    Math.floor((batch.budgetMicros - batch.micros) / grant.caseMicros),
    grant.caseCount - completed,
  ));
  state.lastRun = run;
  if (pairs === 0) return { state, lease: null };
  const calls = pairs * 2, micros = pairs * grant.caseMicros;
  state.lease = { run, day, campaign: grant.id, batch: grant.batchId, phase: grant.phase,
    calls, micros, priorCalls: campaign.calls };
  state.days[day] = used + calls;
  campaign.calls += calls;
  campaign.micros += micros;
  batch.calls += calls;
  batch[grant.phase] += calls;
  batch.micros += micros;
  return { state, lease: state.lease };
}
export function finishBatch(previous: SharedState, grant: Campaign, run: string, ledger: Ledger) {
  const state: SharedState = structuredClone(previous);
  const lease = state.lease;
  if (!lease || lease.run !== run || lease.campaign !== grant.id ||
      lease.batch !== grant.batchId || lease.phase !== grant.phase) throw Error("STALE_LEASE");
  const campaign = state.campaigns[grant.id];
  const batch = state.batches[grant.batchId];
  if (campaign.grantHash !== grantHash(grant)) throw Error("GRANT_CHANGED_NO_RESET");
  const before = campaign.ledger?.calls ?? [];
  const beforeResults = campaign.ledger?.results ?? [];
  if (JSON.stringify(ledger.calls.slice(0, before.length)) !== JSON.stringify(before) ||
      JSON.stringify(ledger.results.slice(0, beforeResults.length)) !== JSON.stringify(beforeResults) ||
      ledger.calls.length < before.length || ledger.results.length < beforeResults.length ||
      ledger.calls.length - before.length > lease.calls) throw Error("LEDGER_PREFIX_OR_LIMIT");
  const added = ledger.calls.slice(before.length);
  const newResults = ledger.results.slice(beforeResults.length);
  const ids = new Set(added.map((call) => call.id));
  if (ids.size > lease.calls / 2 ||
      added.some((call) => call.day !== lease.day || ![1, 2].includes(call.attempt) ||
        before.some((prior) => prior.id === call.id)) ||
      new Set(newResults.map((row) => row.id)).size !== newResults.length ||
      newResults.some((row) => !ids.has(row.id)) ||
      [...ids].some((id) => {
        const calls = added.filter((call) => call.id === id);
        return calls.length > 2 || calls[0].attempt !== 1 ||
          (calls.length === 2 && calls[1].attempt !== 2);
      })) throw Error("INVALID_BATCH_RESULT");
  campaign.ledger = ledger;
  // An incomplete/unknown request consumes the ENTIRE durable reservation.
  if (ledger.haltReason || [...ids].some((id) =>
      !newResults.some((row) => row.id === id && row.state === "FINISHED"))) {
    campaign.halt = "INCOMPLETE_REQUIRES_RECONCILIATION";
    batch.halt = campaign.halt;
  } else {
    state.days[lease.day] -= lease.calls - added.length;
    campaign.calls -= lease.calls - added.length;
    campaign.micros -= lease.micros - ids.size * grant.caseMicros;
    batch.calls -= lease.calls - added.length;
    batch[grant.phase] -= lease.calls - added.length;
    batch.micros -= lease.micros - ids.size * grant.caseMicros;
  }
  delete state.lease;
  return state;
}
