import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertHqIntakeListPreviewEnvironment, assertReviewedReleaseEnvironment, HQ_INTAKE_LIST_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: HQ_INTAKE_LIST_PREVIEW_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", CONSULTATION_HQ_ENABLED: "true", CONSULTATION_PREVIEW_INTAKE_ENABLED: "false", DATABASE_URL: pool, DIRECT_URL: direct };
const tripwire = "FORBIDDEN_DATABASE_OR_MIGRATION";
const preload = `import { registerHooks } from "node:module"; registerHooks({resolve(specifier,context,next){const source=specifier==="@prisma/client"?"export class PrismaClient { constructor(){throw new Error('${tripwire}');}}":specifier==="node:child_process"?"export function execFileSync(){throw new Error('${tripwire}');}":null; return source?{url:"data:text/javascript,"+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);}});`;
function run(patch: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...valid, NODE_ENV: "production", VITEST: "", VITEST_WORKER_ID: "", GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", PRODUCTION_MIGRATION_TARGET: "must-not-run", ...patch };
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], { env, encoding: "utf8", timeout: 10000 });
  const output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined(); expect(output).not.toContain(tripwire);
  for (const secret of [env.DATABASE_URL, env.DIRECT_URL]) if (secret) expect(output).not.toContain(secret);
  return { status: result.status, output };
}
describe("exact approved HQ intake list preview", () => {
  it("retains isolated DB checks and exits before any migration or client construction", () => {
    expect(assertReviewedReleaseEnvironment(valid)).toBe("hq-intake-list-preview");
    const result = run(); expect(result.status).toBe(0); expect(result.output).toContain("public_intake_disabled=true migrations_skipped=true");
  });
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "CONSULTATION_HQ_ENABLED", "CONSULTATION_PREVIEW_INTAKE_ENABLED", "DATABASE_URL", "DIRECT_URL"])("fails closed for missing/malformed %s", key => {
    for (const value of [undefined, "", "wrong"]) {
      expect(() => assertHqIntakeListPreviewEnvironment({ ...valid, [key]: value })).toThrow();
      expect(run({ [key]: value }).status).not.toBe(0);
    }
  });
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a different project or routing injection in %s", key => {
    for (const value of [direct.replace("ttworfzgwejdeolegkxl", "other-project"), direct + "?host=other.invalid", pool + "?schema=private"]) expect(run({ [key]: value }).status).not.toBe(0);
  });
  it("requires intake disabled and rejects conflicting providers", () => {
    expect(run({ CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" }).status).not.toBe(0);
    for (const key of ["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"]) expect(run({ [key]: "main" }).status).not.toBe(0);
  });
  it("keeps automatic branch deployment off and production main unchanged", () => {
    const enabled = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
    expect(enabled[HQ_INTAKE_LIST_PREVIEW_BRANCH]).toBe(false); expect(enabled.main).not.toBe(false);
  });
});
