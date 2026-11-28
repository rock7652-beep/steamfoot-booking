import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { sealReview, openReview } from "../../scripts/qa/brand-ai-quality/review-envelope";
import { blankState, reserveBatch, finishBatch, seal, unseal, digest,
  requireOriginalRun, requireContinuousHistory,
  type Campaign, type Ledger } from "../../scripts/qa/brand-ai-quality/shared-state";
import { toLocalDateStr } from "../lib/date-utils";

const key = "a".repeat(64); // Synthetic encryption fixture, never an API credential.
const context = "synthetic-quality-state";
const grant: Campaign = {
  id: "quality-test", batchId: "quality-test", phase: "initial", sha: "a".repeat(40), corpusHash: "b".repeat(64),
  model: "gpt-6-luna", maxCalls: 70, budgetMicros: 1000000,
  caseMicros: 2256, caseCount: 35,
};
const ledger = (count: number, day = "2026-11-28", offset = 0): Ledger => ({
  calls: Array.from({ length: count }, (_, n) => ({ id: `case-${n + offset}`, attempt: 1, day })),
  results: Array.from({ length: count }, (_, n) => ({ id: `case-${n + offset}`, state: "FINISHED", codes: [] })),
});
describe("durable quality reservations", () => {
  it("finishes35 two-attempt cases in one day then allows at most30 retest calls across all SHAs", () => {
    const initial = reserveBatch(blankState(), grant, "initial-run", "2026-11-28", 60000);
    expect(initial.lease?.calls).toBe(70);
    const results = ledger(35);
    results.calls = results.calls.flatMap((call) => [call, { ...call, attempt: 2 }]);
    const done = finishBatch(initial.state, grant, "initial-run", results);
    const retest: Campaign = { ...grant, id: "revision-2", phase: "retest", maxCalls: 30,
      sha: "c".repeat(40), caseCount: 15 };
    const retry = reserveBatch(done, retest, "retest-run", "2026-11-28", 60000);
    expect(retry.lease?.calls).toBe(30);
    const revised = ledger(15);
    revised.calls = revised.calls.flatMap((call) => [call, { ...call, attempt: 2 }]);
    const final = finishBatch(retry.state, retest, "retest-run", revised);
    expect(final.days["2026-11-28"]).toBe(100);
    expect(final.batches[grant.batchId]).toMatchObject({ calls: 100, initial: 70, retest: 30, micros: 112800 });
    expect(final.campaigns[grant.id].ledger?.results).toHaveLength(35);
    const nextSha = { ...retest, id: "revision-3", sha: "d".repeat(40) };
    expect(reserveBatch(final, nextSha, "no-more", "2026-11-29", 60000).lease).toBeNull();
    expect(reserveBatch(done, { ...grant, id: "another-initial-version" },
      "bypass", "2026-11-29", 60000).lease).toBeNull();
    expect(final.batches[grant.batchId].micros).toBeLessThanOrEqual(1000000);
  });

  it("carries actual initial use, cost and the30-call retest phase across version IDs", () => {
    const initial = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    const done = finishBatch(initial.state, grant, "1", ledger(35));
    const revision: Campaign = { ...grant, id: "revision-2", phase: "retest", maxCalls: 30,
      sha: "c".repeat(40), caseCount: 1 };
    const retry = reserveBatch(done, revision, "2", "2026-11-28", 60000);
    const finished = finishBatch(retry.state, revision, "2", ledger(1));
    expect(finished.batches[grant.batchId]).toMatchObject({ calls: 36, initial: 35, retest: 1, micros: 81216 });
    expect(finished.campaigns[grant.id].calls).toBe(35);
    const next = reserveBatch(finished, { ...revision, id: "revision-3", caseCount: 35 }, "3", "2026-11-28", 60000);
    expect(next.lease?.calls).toBe(28); // Two slots required before starting a repairable case.
    expect(next.state.batches[grant.batchId].calls).toBe(64);
  });
  it("rejects a rerun before latest-attempt skipped jobs can hide the original consumption", () => {
    expect(() => requireOriginalRun({ status: "completed", run_attempt: 2 })).toThrow("REPLAY");
    expect(() => requireOriginalRun({ status: "queued", run_attempt: 1 })).toThrow("NOT_COMPLETE");
    expect(() => requireOriginalRun({ status: "completed", run_attempt: 1 })).not.toThrow();
    expect(() => requireContinuousHistory(1, 4, [1, 2, 4])).toThrow("HISTORY_GAP");
    expect(() => requireContinuousHistory(1, 4, [1, 2, 3, 4, 5])).toThrow("NOT_STABLE");
    expect(() => requireContinuousHistory(1, 4, [4, 3, 2, 1])).not.toThrow();
    const workflowSource = readFileSync("scripts/qa/brand-ai-quality/shared-runner.ts", "utf8");
    expect(workflowSource).toContain("CHECKPOINT_HISTORY_MISSING_NO_RESET");
    expect(workflowSource).not.toContain("runs.length < 100) return blankState()");
    expect(workflowSource.indexOf("requireOriginalRun(prior)")).toBeLessThan(
      workflowSource.indexOf("const eligible ="));
  });
  it("persists a worst-case allowance before calls and refuses a second runner after a crash", () => {
    const batch = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    expect(batch.lease?.calls).toBe(70);
    expect(batch.state.days["2026-11-28"]).toBe(70);
    expect(batch.state.campaigns[grant.id].micros).toBe(78960);
    const restored = unseal(seal(batch.state, key, context), key, context);
    expect(() => reserveBatch(restored, grant, "2", "2026-11-29", 60000))
      .toThrow("RECONCILE_NO_REFUND");
  });
  it("returns only proven-unused reservations and cannot replay a run", () => {
    const batch = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    const done = finishBatch(batch.state, grant, "1", ledger(3));
    expect(done.days["2026-11-28"]).toBe(3);
    expect(done.campaigns[grant.id].calls).toBe(3);
    expect(done.campaigns[grant.id].micros).toBe(6768);
    expect(() => reserveBatch(done, grant, "1", "2026-11-28", 60000)).toThrow("RUN_ALREADY_USED");
    expect(() => finishBatch(done, grant, "1", ledger(3))).toThrow("STALE_LEASE");
  });
  it("shares the test-only daily100 ceiling across PRs without changing Production limits", () => {
    const first = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    const usage = ledger(35);
    usage.calls = usage.calls.flatMap((call) => [call, { ...call, attempt: 2 }]);
    const done = finishBatch(first.state, grant, "1", usage);
    const other: Campaign = { ...grant, id: "other-pr", batchId: "other-pr", sha: "c".repeat(40) };
    const second = reserveBatch(done, other, "2", "2026-11-28", 60000);
    expect(second.lease?.calls).toBe(30);
    const rest = ledger(15);
    rest.calls = rest.calls.flatMap((call, index) => index < 14
      ? [call, { ...call, attempt: 2 }] : [call]);
    const nearlyFull = finishBatch(second.state, other, "2", rest);
    const third = { ...other, id: "third-pr", batchId: "third-pr" };
    expect(nearlyFull.days["2026-11-28"]).toBe(99);
    expect(reserveBatch(nearlyFull, third, "3", "2026-11-28", 60000).lease).toBeNull();
    expect(reserveBatch(nearlyFull, third, "4", "2026-11-29", 60000).lease?.calls).toBe(70);
    expect(readFileSync("src/server/services/brand-ai-quota.ts", "utf8")).toMatch(/20/);
  });
  it("counts correction calls and conservatively retains unknown cost", () => {
    const batch = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    const repaired: Ledger = { calls: [
      { id: "case-1", attempt: 1, day: "2026-11-28" },
      { id: "case-1", attempt: 2, day: "2026-11-28" },
    ], results: [{ id: "case-1", state: "FINISHED", codes: [] }] };
    const done = finishBatch(batch.state, grant, "1", repaired);
    expect(done.campaigns[grant.id].calls).toBe(2);
    expect(done.campaigns[grant.id].micros).toBe(2256);
    const unknown = structuredClone(repaired);
    unknown.haltReason = "TRANSPORT_ERROR";
    const stopped = finishBatch(batch.state, grant, "1", unknown);
    expect(stopped.campaigns[grant.id].calls).toBe(70);
    expect(stopped.campaigns[grant.id].micros).toBe(78960);
    expect(() => reserveBatch(stopped, grant, "2", "2026-11-29", 60000)).toThrow("REQUIRES_REVIEW");
  });
  it("does not refund a charged request without a completed result", () => {
    const batch = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    const partial = ledger(1);
    partial.results = [];
    const stopped = finishBatch(batch.state, grant, "1", partial);
    expect(stopped.days["2026-11-28"]).toBe(70);
    expect(stopped.campaigns[grant.id].halt).toBeTruthy();
  });
  it("binds the grant and preserves the prefix, case identity and exact attempts", () => {
    const batch = reserveBatch(blankState(), grant, "1", "2026-11-28", 60000);
    expect(() => finishBatch(batch.state, { ...grant, budgetMicros: 90000 }, "1", ledger(1)))
      .toThrow("GRANT_CHANGED");
    const bad = ledger(1, "2026-11-29");
    expect(() => finishBatch(batch.state, grant, "1", bad)).toThrow("INVALID_BATCH");
    const done = finishBatch(batch.state, grant, "1", ledger(2));
    const next = reserveBatch(done, grant, "2", "2026-11-29", 60000);
    const changed = ledger(3);
    changed.calls[0].id = "tampered";
    expect(() => finishBatch(next.state, grant, "2", changed)).toThrow("PREFIX");
    expect(() => reserveBatch(done, { ...grant, sha: "d".repeat(40) }, "3", "2026-11-29", 60000))
      .toThrow("GRANT_CHANGED_NO_RESET");
  });
  it("enforces a dollar ceiling before reserving and waits at the Taiwan day boundary", () => {
    const small = { ...grant, budgetMicros: 2256 };
    const batch = reserveBatch(blankState(), small, "1", "2026-11-28", 60000);
    expect(batch.lease?.calls).toBe(2);
    const done = finishBatch(batch.state, small, "1", ledger(1));
    expect(reserveBatch(done, small, "2", "2026-11-29", 60000).lease).toBeNull();
    expect(reserveBatch(blankState(), grant, "3", "2026-11-28", 14999).lease).toBeNull();
    expect(reserveBatch(blankState(), { ...grant, notBeforeDay: "2026-11-29" },
      "3", "2026-11-28", 60000).lease).toBeNull();
    expect(() => reserveBatch(blankState(), { ...grant, model: "unapproved" } as never,
      "4", "2026-11-28", 60000)).toThrow("GRANT_NOT_APPROVED");
  });
  it("authenticates repository context, key and ciphertext without exposing plaintext", () => {
    const encrypted = seal(reserveBatch(blankState(), grant, "1", "2026-11-28", 60000).state, key, context);
    expect(encrypted).not.toContain("quality-test");
    expect(() => unseal(encrypted, "b".repeat(64), context)).toThrow();
    expect(() => unseal(encrypted, key, "another-repo")).toThrow();
    const tampered = JSON.parse(encrypted);
    tampered.tag = "0".repeat(32);
    expect(() => unseal(JSON.stringify(tampered), key, context)).toThrow();
    expect(() => seal(blankState(), "not-a-key", context)).toThrow("STATE_KEY_FORMAT");
  });
});

it("moves an encrypted checkpoint between two independent Node runners", () => {
  const modulePath = resolve("scripts/qa/brand-ai-quality/shared-state.ts");
  const worker = `import api from ${JSON.stringify(modulePath)};
    const {reserveBatch, blankState, seal, unseal}=api;
    const key='a'.repeat(64), grant=${JSON.stringify(grant)};
    if(process.argv[1]==='first') console.log(seal(reserveBatch(blankState(),grant,'1','2026-11-28',60000).state,key,'fixture'));
    else { const s=unseal(process.env.CHECKPOINT,key,'fixture');
      try { reserveBatch(s,grant,'2','2026-11-29',60000); process.exit(9); }
      catch { console.log(JSON.stringify({blocked:true,reserved:s.days['2026-11-28']})); } }`;
  const first = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", worker, "first"], { encoding: "utf8" });
  expect(first.status, first.stderr).toBe(0);
  const second = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", worker, "second"], {
    encoding: "utf8", env: { ...process.env, CHECKPOINT: first.stdout.trim() },
  });
  expect(second.status, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toEqual({ blocked: true, reserved: 70 });
}, 15000);

it("runs the existing evaluator across two processes with a fake provider, without duplicate calls", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "steamfoot-shared-eval-"));
  try {
    const candidate = resolve(dir, "candidate");
    mkdirSync(resolve(candidate, "src/server/services"), { recursive: true });
    mkdirSync(resolve(candidate, "scripts/qa/brand-ai-quality"), { recursive: true });
    const corpus = readFileSync("scripts/qa/brand-ai-quality/cases.json", "utf8");
    writeFileSync(resolve(candidate, "scripts/qa/brand-ai-quality/cases.json"), corpus);
    writeFileSync(resolve(candidate, "src/server/services/brand-ai-provider.ts"), `
      export async function selectBrandAiAnswer(q,e,transport,before) {
        if(!await before(1)) throw Error('RESERVATION_REJECTED');
        return {text:'合成回答',knowledgeIds:[],inputTokens:100,outputTokens:20,
          diagnostics:{model:'gpt-6-luna',route:'generated',attempts:1,failures:[],usage:[],availableSourceIds:[]}};
      }`);
    writeFileSync(resolve(candidate, "src/server/services/brand-ai-knowledge.ts"),
      "export function brandKnowledge(){return {sources:[]}};");
    const report = resolve(dir, "ledger.json");
    const args = ["--conditions=react-server", "--import", "tsx", "scripts/qa/brand-ai-quality/evaluate.ts",
      "--real", "--implementation-root", candidate, "--authorized-calls", "70",
      "--batch-calls", "2", "--daily-used", "0", "--expected-day", toLocalDateStr(), "--ledger", report];
    for (let i = 0; i < 2; i++) {
      const child = spawnSync(process.execPath, args, { encoding: "utf8", env: {
        ...process.env, OPENAI_API_KEY: "synthetic-no-network", BRAND_AI_ENABLED: "0",
        BRAND_AI_MODEL: "gpt-6-luna", NODE_OPTIONS: "--conditions=react-server",
      } });
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).not.toContain("合成回答");
      expect(child.stdout).not.toContain("synthetic-no-network");
    }
    const result = JSON.parse(readFileSync(report, "utf8"));
    expect(result.calls).toHaveLength(2);
    expect(new Set(result.calls.map((c: { id: string }) => c.id)).size).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.fingerprint).toBe(digest(corpus));
    expect(result.results.every((row: { review: { status: string } }) => row.review.status === "PENDING")).toBe(true);
    const fullReport = resolve(dir, "full35.json");
    const fullArgs = [...args];
    fullArgs[fullArgs.indexOf(report)] = fullReport;
    fullArgs[fullArgs.indexOf("--batch-calls") + 1] = "70";
    fullArgs.push("--batch-cases", "35");
    const complete = spawnSync(process.execPath, fullArgs, { encoding: "utf8", env: {
      ...process.env, OPENAI_API_KEY: "synthetic-no-network", BRAND_AI_ENABLED: "0",
      BRAND_AI_MODEL: "gpt-6-luna", NODE_OPTIONS: "--conditions=react-server",
    } });
    expect(complete.status, complete.stderr).toBe(0);
    const full = JSON.parse(readFileSync(fullReport, "utf8"));
    expect(full.calls).toHaveLength(35);
    expect(full.results).toHaveLength(35);
    expect(new Set(full.calls.map((c: { day: string }) => c.day))).toEqual(new Set([toLocalDateStr()]));
    expect(full.results.every((row: { review: { status: string } }) => row.review.status === "PENDING")).toBe(true);
    const chosen = JSON.parse(corpus).filter((row: { channel: string }) => row.channel === "api")
      .slice(-2).map((row: { id: string }) => row.id);
    const retestReport = resolve(dir, "retest.json");
    const retestArgs = [...args];
    retestArgs[retestArgs.indexOf(report)] = retestReport;
    retestArgs[retestArgs.indexOf("--batch-calls") + 1] = "4";
    retestArgs.push("--case-ids", chosen.join(","));
    const subset = spawnSync(process.execPath, retestArgs, { encoding: "utf8", env: {
      ...process.env, OPENAI_API_KEY: "synthetic-no-network", BRAND_AI_ENABLED: "0",
      BRAND_AI_MODEL: "gpt-6-luna", NODE_OPTIONS: "--conditions=react-server",
    } });
    expect(subset.status, subset.stderr).toBe(0);
    expect(JSON.parse(readFileSync(retestReport, "utf8")).results.map((row: { id: string }) => row.id))
      .toEqual(chosen);
    // A fake authentication failure stops this batch and all later resumes.
    writeFileSync(resolve(candidate, "src/server/services/brand-ai-provider.ts"), `
      export async function selectBrandAiAnswer(q,e,transport,before) {
        await before(1);
        return {text:'安全提示',knowledgeIds:[],inputTokens:null,outputTokens:null,
          diagnostics:{route:'uncertain',attempts:1,failures:[{code:'HTTP_401'}]}};
      }`);
    const failed = spawnSync(process.execPath, args, { encoding: "utf8", env: {
      ...process.env, OPENAI_API_KEY: "synthetic-no-network", BRAND_AI_ENABLED: "0",
      BRAND_AI_MODEL: "gpt-6-luna", NODE_OPTIONS: "--conditions=react-server",
    } });
    expect(failed.status).toBe(0);
    const stopped = JSON.parse(readFileSync(report, "utf8"));
    expect(stopped.calls).toHaveLength(3);
    expect(stopped.haltReason).toBe("MODEL_INFRASTRUCTURE_REQUIRES_REVIEW");
    const retry = spawnSync(process.execPath, args, { encoding: "utf8", env: {
      ...process.env, OPENAI_API_KEY: "synthetic-no-network", BRAND_AI_ENABLED: "0",
      BRAND_AI_MODEL: "gpt-6-luna", NODE_OPTIONS: "--conditions=react-server",
    } });
    expect(retry.status).toBe(1);
    expect(JSON.parse(readFileSync(report, "utf8")).calls).toHaveLength(3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 20000);

it("keeps the shared workflow separate from deployments, unreviewed PRs and Production secrets", () => {
  const workflow = readFileSync(".github/workflows/ai-quality.yml", "utf8");
  expect(workflow).toContain("environment: steamfoot-ai-quality");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).not.toMatch(/pull_request_target|pull_request:|vercel |migrate deploy|DATABASE_URL|DIRECT_URL|LINE_CHANNEL/);
  expect(workflow).toContain("--ignore-scripts");
  expect(workflow.indexOf("name: Persist reservation")).toBeLessThan(workflow.indexOf("name: Model evaluation"));
  const modelStep = workflow.split("- name: Model evaluation")[1].split("- name:")[0];
  expect(modelStep).not.toContain("STATE_KEY");
  expect(modelStep).not.toContain("github.token");
  expect(workflow).not.toContain("secrets.OPENAI_API_KEY");
  expect(workflow).toContain("secrets.AI_QUALITY_OPENAI_API_KEY");
  expect(workflow.match(/uses: .*@[a-f0-9]{40}/g)).toHaveLength(5);
  expect(workflow).toContain("workflow_call:");
  expect(workflow).not.toContain("cron:");
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  expect(ci).toContain("needs: ai-quality-admission");
  expect(ci).toContain("quality_mode != 'preflight'");
  expect(ci).toContain("environments/steamfoot-ai-quality --jq");
  const admission = ci.split("ai-quality-admission:")[1].split("  ai-quality:")[0];
  expect(admission).not.toContain("secrets.");
  expect(admission).not.toContain("environment:");
  expect(admission.indexOf("checkout-auth.mjs")).toBeLessThan(admission.indexOf("npm ci"));
  expect(workflow.indexOf("checkout-auth.mjs candidate")).toBeLessThan(
    workflow.indexOf("name: Install reviewed dependencies"));
});

it("clears checkout credentials despite malformed gitlinks, without changing repository content", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "steamfoot-checkout-auth-"));
  try {
    const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: "pipe" });
    git("init");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture");
    const commit = git("rev-parse", "HEAD").trim();
    git("update-index", "--add", "--cacheinfo", `160000,${commit},.claude/worktrees/synthetic`);
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-m", "synthetic malformed gitlink");
    const before = git("ls-files", "--stage");
    const beforeStatus = git("status", "--porcelain", "--untracked-files=no");
    expect(spawnSync("git", ["-C", dir, "submodule", "foreach", "true"]).status).not.toBe(0);
    git("config", "--local", "http.https://github.com/.extraheader", "SYNTHETIC_AUTH_FIXTURE");
    for (let i = 0; i < 2; i++) {
      const cleaned = spawnSync(process.execPath, ["scripts/qa/brand-ai-quality/checkout-auth.mjs", dir], { encoding: "utf8" });
      expect(cleaned.status, cleaned.stderr).toBe(0);
      expect(cleaned.stdout).toBe("CHECKOUT_AUTH_REMOVED\n");
      expect(cleaned.stdout).not.toContain("SYNTHETIC_AUTH_FIXTURE");
    }
    expect(git("ls-files", "--stage")).toBe(before);
    expect(git("status", "--porcelain", "--untracked-files=no")).toBe(beforeStatus);
    expect(spawnSync("git", ["-C", dir, "config", "--local", "--name-only", "--get-regexp", "extraheader"]).status).toBe(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("decrypts a private report off-repo, with restrictive permissions and no plaintext stdout", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "steamfoot-private-report-"));
  try {
    const input = resolve(dir, "state.enc"), output = resolve(dir, "private.json");
    writeFileSync(input, seal(blankState(), key,
      "rock7652-beep/steamfoot-booking:steamfoot-ai-quality:v1"));
    const child = spawnSync(process.execPath, ["--import", "tsx",
      "scripts/qa/brand-ai-quality/private-report.ts", input, output], {
      encoding: "utf8", env: { ...process.env, AI_QUALITY_STATE_KEY: key },
    });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toBe("PRIVATE_REPORT_SAVED_NO_MODEL_CALLS\n");
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(blankState());
    const repeated = spawnSync(process.execPath, ["--import", "tsx",
      "scripts/qa/brand-ai-quality/private-report.ts", input, output], {
      encoding: "utf8", env: { ...process.env, AI_QUALITY_STATE_KEY: key },
    });
    expect(repeated.status).toBe(1);
    expect(repeated.stderr).not.toContain(key);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15000);

it("privately delivers actual answer text without exporting either GitHub Secret", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const report = { sha: grant.sha, answer: "這是合成回答，並非模型品質驗收。" };
  const recipient = Buffer.from(pair.publicKey).toString("base64");
  const encrypted = sealReview(report, recipient, "repo:campaign:run");
  expect(encrypted).not.toContain(report.answer);
  expect(encrypted).not.toContain(key);
  expect(openReview(encrypted, pair.privateKey, "repo:campaign:run")).toEqual(report);
  expect(() => openReview(encrypted, pair.privateKey, "repo:campaign:other-run")).toThrow("CONTEXT");
  expect(() => sealReview(report, "not-a-public-key", "repo:campaign:run")).toThrow();
  const dir = mkdtempSync(resolve(tmpdir(), "steamfoot-review-recipient-"));
  try {
    writeFileSync(resolve(dir, "review.enc"), encrypted);
    writeFileSync(resolve(dir, "recipient.pem"), pair.privateKey, { mode: 0o600 });
    const child = spawnSync(process.execPath, ["--import", "tsx",
      "scripts/qa/brand-ai-quality/private-report.ts", resolve(dir, "review.enc"),
      resolve(dir, "review.json"), "--recipient-key", resolve(dir, "recipient.pem"),
      "--context", "repo:campaign:run"], { encoding: "utf8", env: {
        ...process.env, AI_QUALITY_STATE_KEY: "", OPENAI_API_KEY: "",
      } });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).not.toContain(report.answer);
    expect(JSON.parse(readFileSync(resolve(dir, "review.json"), "utf8"))).toEqual(report);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15000);
