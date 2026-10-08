// URL-only synthetic settings; no passwords, database access or subprocess work.
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assertReviewedReleaseEnvironment, CONSULTATION_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
import { MUSIC_OPENING_BRANCH } from "../../scripts/music-opening-preview-scope.mjs";
import { SPORTS_SHARED_CARD_PREVIEW_BRANCH } from "../../scripts/sports-shared-card-preview-scope.mjs";
const direct = "postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const safe = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: MUSIC_OPENING_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: direct, DIRECT_URL: direct, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
  CONSULTATION_HQ_ENABLED: "", CONSULTATION_PREVIEW_INTAKE_ENABLED: "", GUIDE_UI_PREVIEW: "" };
const invalid = [
  { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "unapproved-preview" },
  { VERCEL_GIT_REPO_OWNER: "other" }, { VERCEL_GIT_REPO_SLUG: "other" },
  { WORKERS_CI_BRANCH: MUSIC_OPENING_BRANCH }, { CF_PAGES_BRANCH: "main" },
  { DIRECT_URL: direct + "?host=other.invalid" }, { DATABASE_URL: direct + "?options=other" },
  { DIRECT_URL: direct + "?connection_limit=zero" }, { DIRECT_URL: direct + "?schema=private" },
  { DIRECT_URL: direct + "?schema=public&schema=public" }, { DIRECT_URL: "" },
];
const tripwire = "MUSIC_TEST_DATABASE_OR_SUBPROCESS_ACCESS";
const prismaStub = `export class PrismaClient { constructor() { throw new Error(${JSON.stringify(tripwire)}); } }`;
const subprocessStub = `export function execFileSync() { throw new Error(${JSON.stringify(tripwire)}); }`;
const preload = `import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = specifier === "@prisma/client" ? ${JSON.stringify(prismaStub)} : specifier === "node:child_process" ? ${JSON.stringify(subprocessStub)} : null;
  if (source) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
  return nextResolve(specifier, context);
} });`;
function run(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...safe, PRODUCTION_MIGRATION_TARGET: "unrelated-pending-migration", ...overrides };
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], { env, encoding: "utf8", timeout: 10_000 });
  const output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined();
  expect(output).not.toContain(tripwire);
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) if (value) expect(output).not.toContain(value);
  return { status: result.status, output };
}
beforeEach(() => { vi.resetModules(); for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
it("dispatches music explicitly and skips all automatic migrations even with a migration target", () => {
  expect(assertReviewedReleaseEnvironment(safe)).toBe("music-opening-preview");
  const result = run();
  expect(result.status).toBe(0);
  expect(result.output).toContain("[music-opening-preview-preflight] isolated_database=true notifications_blocked=true migrations_skipped=true");
  expect(result.output).not.toContain("[sports-shared-card-preview-preflight]");
});
it.each(invalid)("rejects malformed music scope before any migration or database work: %o", (change) => {
  expect(() => assertReviewedReleaseEnvironment({ ...safe, ...change })).toThrow();
  expect(run(change).status).not.toBe(0);
});
it("preserves consultation opt-in checks, sports isolation and production Preview-flag rejection", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...safe, VERCEL_GIT_COMMIT_REF: CONSULTATION_PREVIEW_BRANCH })).toThrow("both existing opt-in flags");
  expect(assertReviewedReleaseEnvironment({ ...safe, VERCEL_GIT_COMMIT_REF: CONSULTATION_PREVIEW_BRANCH, CONSULTATION_HQ_ENABLED: "true", CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" })).toBe("consultation-preview");
  expect(assertReviewedReleaseEnvironment({ ...safe, VERCEL_GIT_COMMIT_REF: SPORTS_SHARED_CARD_PREVIEW_BRANCH })).toBe("sports-shared-card-preview");
  expect(() => assertReviewedReleaseEnvironment({ ...safe, VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: "production", CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" })).toThrow("Preview intake flag must be disabled");
});
it("accepts music in Next configuration and rejects every invalid scope when build commands are overridden", async () => {
  await expect(import("../../next.config")).resolves.toHaveProperty("default");
  for (const change of invalid) {
    vi.resetModules();
    for (const [key, value] of Object.entries(change)) vi.stubEnv(key, value);
    await expect(import("../../next.config")).rejects.toThrow();
    for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value);
  }
});
