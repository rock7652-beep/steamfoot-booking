// Trusted infrastructure. The candidate supplies product/provider code only.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { dayRange, toLocalDateStr } from "../../../src/lib/date-utils";
import { reviewRecipient, sealReview } from "./review-envelope";
import { blankState, digest, seal, unseal, reserveBatch, finishBatch,
  validateGrant, requireOriginalRun, requireContinuousHistory,
  type Campaign, type SharedState, type Ledger } from "./shared-state";

const workflowPath = ".github/workflows/ci.yml";
const sourceBranches = ["fix/brand-ai-p0-quality"];
const root = resolve(dirname(process.argv[1]), "..", "..", "..");
const temporary = resolve(process.env.RUNNER_TEMP ?? "/tmp", "steamfoot-ai-quality");
const context = "rock7652-beep/steamfoot-booking:steamfoot-ai-quality:v1";
const privateState = resolve(temporary, "state.private.json");
const privateLedger = resolve(temporary, "ledger.private.json");
const encrypted = resolve(temporary, "state.enc");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw Error(`SETTING_MISSING:${name}`);
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
  const source = env("GITHUB_REF").replace(/^refs\/heads\//, "");
  if (env("GITHUB_REPOSITORY") !== "rock7652-beep/steamfoot-booking" ||
      !sourceBranches.includes(source) || env("GITHUB_REF") !== `refs/heads/${source}` ||
      env("GITHUB_RUN_ATTEMPT") !== "1" ||
      env("GITHUB_WORKFLOW_REF") !== `rock7652-beep/steamfoot-booking/${workflowPath}@refs/heads/${source}` ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      process.env.BRAND_AI_ENABLED !== "0") throw Error("TRUSTED_WORKFLOW_REQUIRED");
}
async function previousState(key: string): Promise<SharedState> {
  const run = await api(`actions/runs/${env("GITHUB_RUN_ID")}`);
  const genesisId = env("AI_QUALITY_GENESIS_RUN_ID");
  if (!/^\d+$/.test(genesisId)) throw Error("GENESIS_RUN_REQUIRED");
  const genesis = await api(`actions/runs/${genesisId}`);
  requireOriginalRun(genesis as { status: string; run_attempt: number });
  if (genesis.workflow_id !== run.workflow_id || !sourceBranches.includes(String(genesis.head_branch)) ||
      genesis.conclusion !== "success") throw Error("GENESIS_NOT_VERIFIED");
  type Run = { id: number; status: string; run_attempt: number; run_number: number; event: string };
  const history: Run[] = [];
  // A deleted entire run must not make an older checkpoint look current.
  for (let page = 1; page <= 100; page++) {
    const data = await api(`actions/workflows/${run.workflow_id}/runs?per_page=100&page=${page}`);
    const runs = data.workflow_runs as Run[];
    history.push(...runs.filter((row) => row.run_number >= Number(genesis.run_number)));
    if (runs.length < 100 || runs.some((row) => row.run_number <= Number(genesis.run_number))) break;
    if (page === 100) throw Error("RUN_HISTORY_INCOMPLETE_NO_BOOTSTRAP");
  }
  requireContinuousHistory(Number(genesis.run_number), Number(run.run_number),
    history.map((row) => row.run_number));
  for (const prior of history.sort((a, b) => b.run_number - a.run_number)) {
      if (String(prior.id) === env("GITHUB_RUN_ID")) continue;
      // Normal PR CI can never enter the secret-bearing dispatch-only job.
      // Keep its number in the history audit, without treating its reruns as model reruns.
      if (prior.event !== "workflow_dispatch") continue;
      requireOriginalRun(prior);
      const jobs = await api(`actions/runs/${prior.id}/jobs?per_page=100`);
      const eligible = (jobs.jobs as { steps?: { name: string; conclusion: string; started_at?: string }[] }[])
        .some((job) => job.steps?.some((step) =>
          (step.name === "Persist reservation" && step.conclusion === "success") ||
          (step.name === "Model evaluation" && step.conclusion !== "skipped" && step.started_at)));
      if (!eligible) continue;
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
      const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).trim().split("\n").sort();
      if (!names.includes("state.enc") || names.length > 2 ||
          names.some((name) => !["state.enc", "review.enc"].includes(name)))
        throw Error("ARTIFACT_CONTENT_REJECTED");
      const text = execFileSync("unzip", ["-p", zip, "state.enc"], { encoding: "utf8", maxBuffer: 20_000_000 });
      const state = unseal(text, key, context);
      if (state.lastRun !== String(prior.id) || state.genesisRun !== genesisId)
        throw Error("CHECKPOINT_RUN_MISMATCH");
      return state;
  }
  throw Error("CHECKPOINT_HISTORY_MISSING_NO_RESET");
}
async function main() {
  runtime();
  const grant = campaign();
  const command = process.argv[2];
  const initialize = process.env.AI_QUALITY_MODE === "initialize";
  if (initialize && (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      process.env.AI_QUALITY_GENESIS_RUN_ID)) throw Error("GENESIS_ALREADY_CONFIGURED");
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  if (command === "inspect") {
    const source = env("GITHUB_REF").replace(/^refs\/heads\//, "");
    const branch = await api(`branches/${encodeURIComponent(source)}`);
    if (branch.protected !== true) throw Error("PROTECT_REVIEWED_SOURCE_FIRST");
    const environment = await api("environments/steamfoot-ai-quality");
    const policy = environment.deployment_branch_policy as {
      protected_branches?: boolean; custom_branch_policies?: boolean;
    } | null;
    const rules = await api("environments/steamfoot-ai-quality/deployment-branch-policies");
    const selected = rules.branch_policies as { name: string; type?: string }[];
    if (!policy?.custom_branch_policies || policy.protected_branches ||
        Number(rules.total_count) !== 1 || selected.length !== 1 ||
        selected[0].name !== source || selected[0].type === "tag")
      throw Error("EXACT_SOURCE_ENVIRONMENT_POLICY_REQUIRED");
    const review = (environment.protection_rules as {
      type: string; prevent_self_review?: boolean;
      reviewers?: { type: string; reviewer: { login?: string } }[];
    }[]).find((rule) => rule.type === "required_reviewers");
    if (!review || review.prevent_self_review === true || review.reviewers?.length !== 1 ||
        review.reviewers[0].type !== "User" ||
        review.reviewers[0].reviewer.login !== "rock7652-beep" ||
        environment.can_admins_bypass === true)
      throw Error("SINGLE_OWNER_ENVIRONMENT_APPROVAL_REQUIRED");
    const summary = { stage: "READ_ONLY_ADMISSION", workflowSha: env("GITHUB_SHA"),
      candidateSha: grant.sha, campaign: grant.id, batch: grant.batchId,
      phase: grant.phase, cases: grant.caseCount, campaignCalls: grant.maxCalls,
      batchCalls: 100, dailyCalls: 100, batchBudgetUsd: grant.budgetMicros / 1000000 };
    console.log(JSON.stringify(summary));
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `Owner review required before Secret release.\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
    appendFileSync(env("GITHUB_OUTPUT"), `sha=${grant.sha}\n`);
    return;
  }
  if (command === "precheck") {
    if (!env("OPENAI_API_KEY").trim()) throw Error("SETTING_MISSING:OPENAI_API_KEY");
    if (process.env.AI_QUALITY_REVIEW_PUBLIC_KEY)
      reviewRecipient(process.env.AI_QUALITY_REVIEW_PUBLIC_KEY);
    seal(blankState(), env("AI_QUALITY_STATE_KEY"), context);
    const target = resolve(root, "candidate");
    if (execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== grant.sha ||
        execFileSync("git", ["-C", target, "status", "--porcelain", "--untracked-files=no"],
          { encoding: "utf8" }).trim() !== "" ||
        digest(readFileSync(resolve(target, "scripts/qa/brand-ai-quality/cases.json"), "utf8")) !== grant.corpusHash)
      throw Error("CANDIDATE_NOT_REVIEWED");
    return;
  }
  if (command === "prepare") {
    const key = env("AI_QUALITY_STATE_KEY");
    if (initialize) {
      const state = blankState();
      state.genesisRun = state.lastRun = env("GITHUB_RUN_ID");
      privateWrite(privateState, state);
      writeFileSync(encrypted, seal(state, key, context), { mode: 0o600 });
      appendFileSync(env("GITHUB_OUTPUT"), "calls=0\n");
      return;
    }
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
      OPENAI_API_KEY: env("OPENAI_API_KEY").trim(), BRAND_AI_ENABLED: "0", BRAND_AI_MODEL: grant.model,
      NODE_OPTIONS: "--conditions=react-server",
    };
    // Candidate never receives the state encryption key or GitHub/runtime tokens.
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx",
      resolve(root, "scripts/qa/brand-ai-quality/evaluate.ts"), "--real",
      "--implementation-root", resolve(root, "candidate"),
      "--authorized-calls", String(grant.maxCalls), "--daily-used", String(baseline),
      "--batch-calls", String(state.lease.calls), "--expected-day", state.lease.day,
      "--batch-cases", String(state.lease.calls / 2),
      ...(grant.caseIds ? ["--case-ids", grant.caseIds.join(",")] : []),
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
    const c = finished.campaigns[grant.id] ?? { calls: 0, micros: 0, ledger: null, halt: undefined };
    const batch = finished.batches[grant.batchId];
    if (process.env.AI_QUALITY_REVIEW_PUBLIC_KEY) {
      writeFileSync(resolve(temporary, "review.enc"), sealReview({
        campaign: grant.id, batch: grant.batchId, sha: grant.sha,
        corpusHash: grant.corpusHash, ledger: c.ledger,
        reservedOrChargedCalls: batch?.calls ?? 0,
        conservativeMicros: batch?.micros ?? 0,
        unresolvedReservation: Boolean(finished.lease), halted: Boolean(c.halt || batch?.halt),
      }, process.env.AI_QUALITY_REVIEW_PUBLIC_KEY,
      `${env("GITHUB_REPOSITORY")}:${grant.id}:${env("GITHUB_RUN_ID")}`), { mode: 0o600 });
    }
    console.log(JSON.stringify({ campaign: grant.id, reservedOrChargedCalls: c.calls,
      ledgerRecordedAttempts: c.ledger?.calls.length ?? 0,
      conservativeMicros: c.micros, unresolvedReservation: Boolean(finished.lease),
      batch: grant.batchId, batchCallsReservedOrCharged: batch?.calls ?? 0,
      batchConservativeMicros: batch?.micros ?? 0,
      halted: Boolean(c.halt), humanQuality: "PENDING", modelQualityPassed: false,
      lineSends: 0, vercelBuilds: 0 }));
    if (finished.lease || c.halt) process.exitCode = 2;
    return;
  }
  throw Error("UNKNOWN_PHASE");
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const code = /^(?:SETTING_MISSING:[A-Z_]+|[A-Z][A-Z0-9_]{2,100})$/.test(message)
    ? message : "AI_QUALITY_STOPPED_NO_PRIVATE_DETAILS";
  console.error(JSON.stringify({ stage: process.argv[2], code }));
  process.exitCode = 1;
});
