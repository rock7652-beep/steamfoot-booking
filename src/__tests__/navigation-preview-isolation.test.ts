import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment, NAVIGATION_STABILITY_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: NAVIGATION_STABILITY_PREVIEW_BRANCH, VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: pool, DIRECT_URL: direct };
it("accepts this exact navigation Preview against the isolated database only", () => {
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
});
it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a production or missing %s", key => {
  for (const value of [undefined, "", direct.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf")]) expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: value })).toThrow();
});
it("does not allow a production target or another repository", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_ENV: "production" })).toThrow();
  expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_GIT_REPO_OWNER: "other" })).toThrow();
});
it("skips migration and database construction before build", () => {
  const marker = "UNEXPECTED_NAVIGATION_PREVIEW_DATABASE";
  const client = `export class PrismaClient { constructor() { throw Error('${marker}'); } }`;
  const processStub = `export function execFileSync(){throw Error('${marker}');}`;
  const preload = `import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){const source=s==='@prisma/client'?${JSON.stringify(client)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:n(s,c);}});`;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], { env: { ...process.env, ...valid, WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", GUIDE_UI_PREVIEW: "" }, encoding: "utf8", timeout: 10000 });
  expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).toContain("migrations_skipped=true");
  expect(result.stdout + result.stderr).not.toContain(marker);
});
