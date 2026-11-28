// Trusted infrastructure. The candidate supplies product/provider code only.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { dayRange, toLocalDateStr } from "../../../src/lib/date-utils";
import { blankState, digest, seal, unseal, reserveBatch, finishBatch,
  validateGrant, type Campaign, type SharedState, type Ledger } from "./shared-state";

const workflowPath = ".github/workflows/ai-quality.yml";
const root = resolve(dirname(process.argv[1]), "..", "..", "..");
const temporary = resolve(process.env.RUNNER_TEMP ?? "/tmp", "steamfoot-ai-quality");
const context = "rock7652-beep/steamfoot-booking:steamfoot-ai-quality:v1";
const privateState = resolve(temporary, "state.private.json");
const privateLedger = resolve(temporary, "ledger.private.json");
const encrypted = resolve(temporary, "state.enc");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw Error("REQUIRED_RUNTIME_SETTING_MISSING");
  return value;
};
function privateWrite(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
}
function campaign(): Campaign {
  const manifest = JSON.parse(readFileSync(resolve(root, "scripts/qa/brand-ai-quality/campaigns.json"), "utf8"));
  const id = process.env.AI_QUALITY_CAMPAIGN || manifest.active;
  const grant = manifest.campaigns.find((row: Campaign) => row.id === id);
  if (!grant || Date.now() >= Date.parse(grant.ratesValidUntil) ||
      !Number.isFinite(Date.parse(grant.ratesValidUntil))) throw Error("CAMPAIGN_OR_RATE_NOT_APPROVED");
  validateGrant(grant);
  return grant;
}
async function api(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com/repos/${env("GITHUB_REPOSITORY")}/${path}`, {
    headers: { Authorization: `Bearer ${env("GH_TOKEN")}`, Accept: "application/vnd.github+json" },
    redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error("GITHUB_STATE_ACCESS_FAILED");
  return response.json();
}
function runtime() {
  if (env("GITHUB_REPOSITORY") !== "rock7652-beep/steamfoot-booking" ||
      env("GITHUB_REF") !== "refs/heads/main" || env("GITHUB_RUN_ATTEMPT") !== "1" ||
      env("GITHUB_WORKFLOW_REF") !== `rock7652-beep/steamfoot-booking/${workflowPath}@refs/heads/main` ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      process.env.BRAND_AI_ENABLED !== "0") throw Error("TRUSTED_WORKFLOW_REQUIRED");
}
async function previousState(key: string): Promise<SharedState> {
  const run = await api(`actions/runs/${env("GITHUB_RUN_ID")}`);
  // Find the preceding real execution, ignoring jobs skipped before reservation.
  // An overlapping/newer execution is never treated as a fresh daily allowance.
  for (let page = 1; page <= 100; page++) {
    const data = await api(`actions/workflows/${run.workflow_id}/runs?per_page=100&page=${page}`);
    const runs = data.workflow_runs as { id: number; status: string; run_attempt: number }[];
    for (const prior of runs) {
      if (String(prior.id) === env("GITHUB_RUN_ID")) continue;
      if (prior.status !== "completed") throw Error("OTHER_RUN_NOT_COMPLETE");
      const jobs = await api(`actions/runs/${prior.id}/jobs?per_page=100`);
      const eligible = (jobs.jobs as { steps?: { name: string; conclusion: string; started_at?: string }[] }[])
        .some((job) => job.steps?.some((step) =>
          (step.name === "Persist reservation" && step.conclusion === "success") ||
          (step.name === "Model evaluation" && step.conclusion !== "skipped" && step.started_at)));
      if (!eligible) continue;
      if (prior.run_attempt !== 1) throw Error("PREVIOUS_RUN_REPLAY_REQUIRES_REVIEW");
      const listing = await api(`actions/runs/${prior.id}/artifacts?per_page=100`);
      if (Number(listing.total_count) > 100) throw Error("ARTIFACT_LIST_INCOMPLETE");
      const artifacts = listing.artifacts as { id: number; name: string; expired: boolean }[];
      const artifact = artifacts.find((a) => a.name === `ai-quality-result-${prior.id}`) ??
        artifacts.find((a) => a.name === `ai-quality-reserved-${prior.id}`);
      if (!artifact || artifact.expired) throw Error("CHECKPOINT_MISSING_NO_RESET");
      const redirect = await fetch(`https://api.github.com/repos/${env("GITHUB_REPOSITORY")}/actions/artifacts/${artifact.id}/zip`, {
        headers: { Authorization: `Bearer ${env("GH_TOKEN")}` }, redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      const url = new URL(redirect.headers.get("location") ?? "https://invalid.invalid");
      if (redirect.status !== 302 || url.protocol !== "https:") throw Error("ARTIFACT_DOWNLOAD_FAILED");
      // Never forward the GitHub bearer token to artifact blob storage.
      const blob = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (!blob.ok || bytes.length > 20_000_000) throw Error("ARTIFACT_DOWNLOAD_FAILED");
      const zip = resolve(temporary, "checkpoint.zip");
      writeFileSync(zip, bytes, { mode: 0o600 });
      const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).trim();
      if (names !== "state.enc") throw Error("ARTIFACT_CONTENT_REJECTED");
      const text = execFileSync("unzip", ["-p", zip, "state.enc"], { encoding: "utf8", maxBuffer: 20_000_000 });
      const state = unseal(text, key, context);
      if (state.lastRun !== String(prior.id)) throw Error("CHECKPOINT_RUN_MISMATCH");
      return state;
    }
    if (runs.length < 100) return blankState();
  }
  throw Error("RUN_HISTORY_INCOMPLETE_NO_BOOTSTRAP");
}
async function main() {
  runtime();
  const grant = campaign();
  const command = process.argv[2];
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  if (command === "inspect") {
    const branch = await api("branches/main");
    if (branch.protected !== true) throw Error("PROTECT_REVIEWED_MAIN_FIRST");
    appendFileSync(env("GITHUB_OUTPUT"), `sha=${grant.sha}\n`);
    return;
  }
  if (command === "precheck") {
    env("OPENAI_API_KEY");
    seal(blankState(), env("AI_QUALITY_STATE_KEY"), context);
    const target = resolve(root, "candidate");
    if (execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== grant.sha ||
        digest(readFileSync(resolve(target, "scripts/qa/brand-ai-quality/cases.json"), "utf8")) !== grant.corpusHash)
      throw Error("CANDIDATE_NOT_REVIEWED");
    return;
  }
  if (command === "prepare") {
    const key = env("AI_QUALITY_STATE_KEY");
    const state = await previousState(key);
    const day = toLocalDateStr();
    const batch = reserveBatch(state, grant, env("GITHUB_RUN_ID"), day,
      dayRange(day).end.getTime() + 1 - Date.now());
    privateWrite(privateState, batch.state);
    if (batch.state.campaigns[grant.id].ledger)
      privateWrite(privateLedger, batch.state.campaigns[grant.id].ledger);
    writeFileSync(encrypted, seal(batch.state, key, context), { mode: 0o600 });
    appendFileSync(env("GITHUB_OUTPUT"), `calls=${batch.lease?.calls ?? 0}\n`);
    return;
  }
  const state: SharedState = JSON.parse(readFileSync(privateState, "utf8"));
  if (command === "run") {
    if (!state.lease || state.lease.run !== env("GITHUB_RUN_ID")) throw Error("DURABLE_LEASE_REQUIRED");
    const before = state.campaigns[grant.id].ledger?.calls.filter((row) => row.day === state.lease!.day).length ?? 0;
    const baseline = state.days[state.lease.day] - state.lease.calls - before;
    const childEnv: NodeJS.ProcessEnv = {
      PATH: env("PATH"), HOME: env("HOME"),
      NODE_ENV: "production",
      OPENAI_API_KEY: env("OPENAI_API_KEY"), BRAND_AI_ENABLED: "0", BRAND_AI_MODEL: grant.model,
      NODE_OPTIONS: "--conditions=react-server",
    };
    // Candidate never receives the state encryption key or GitHub/runtime tokens.
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx",
      resolve(root, "scripts/qa/brand-ai-quality/evaluate.ts"), "--real",
      "--implementation-root", resolve(root, "candidate"),
      "--authorized-calls", String(grant.maxCalls), "--daily-used", String(baseline),
      "--batch-calls", String(state.lease.calls), "--expected-day", state.lease.day,
      "--batch-cases", String(state.lease.calls / 2),
      "--ledger", privateLedger,
    ], { cwd: resolve(root, "candidate"), env: childEnv, stdio: "pipe", timeout: 600000 });
    // Do not forward exception text, stdout or stderr from secret-bearing candidate code.
    if (result.status !== 0) throw Error("MODEL_PROCESS_FAILED_RESERVED_BUDGET_RETAINED");
    writeFileSync(resolve(temporary, "child-complete"), "1", { mode: 0o600 });
    return;
  }
  if (command === "finalize") {
    let finished = state;
    if (state.lease && existsSync(resolve(temporary, "child-complete"))) {
      const ledger: Ledger = JSON.parse(readFileSync(privateLedger, "utf8"));
      finished = finishBatch(state, grant, env("GITHUB_RUN_ID"), ledger);
    }
    writeFileSync(encrypted, seal(finished, env("AI_QUALITY_STATE_KEY"), context), { mode: 0o600 });
    const c = finished.campaigns[grant.id];
    console.log(JSON.stringify({ campaign: grant.id, reservedOrChargedCalls: c.calls,
      ledgerRecordedAttempts: c.ledger?.calls.length ?? 0,
      conservativeMicros: c.micros, unresolvedReservation: Boolean(finished.lease),
      halted: Boolean(c.halt), humanQuality: "PENDING", modelQualityPassed: false,
      lineSends: 0, vercelBuilds: 0 }));
    if (finished.lease || c.halt) process.exitCode = 2;
    return;
  }
  throw Error("UNKNOWN_PHASE");
}
main().catch(() => {
  console.error("AI_QUALITY_STOPPED_NO_PRIVATE_DETAILS");
  process.exitCode = 1;
});
