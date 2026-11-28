import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const branch = "feat/brand-line-ai-v2";
it("keeps V2 hosted deployment disabled and the memory purge scheduled separately", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.git.deploymentEnabled[branch]).toBe(false);
  expect(config.git.deploymentEnabled.main).toBe(false);
  expect(config.crons).toContainEqual({
    path: "/api/cron/brand-ai-memory-cleanup",
    schedule: "*/10 * * * *",
  });
});
it.each(["VERCEL_GIT_COMMIT_REF", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])(
  "fails before any DB work on %s",
  (key) => {
    for (const script of [
      "scripts/music-release-preflight.mjs",
      "scripts/ci-migrate.mjs",
    ]) {
      const result = spawnSync(process.execPath, [script], {
        env: { NODE_ENV: "test", PATH: process.env.PATH, [key]: branch },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Brand AI V2 review branch cannot deploy or access databases",
      );
    }
  },
);

it("keeps the communication-framework review branch non-deploying", () => {
  const branch = "feat/ai-customer-service-framework";
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.git.deploymentEnabled[branch]).toBe(false);
  for (const key of [
    "VERCEL_GIT_COMMIT_REF",
    "WORKERS_CI_BRANCH",
    "CF_PAGES_BRANCH",
  ]) {
    for (const script of [
      "scripts/music-release-preflight.mjs",
      "scripts/ci-migrate.mjs",
    ]) {
      const result = spawnSync(process.execPath, [script], {
        env: { NODE_ENV: "test", PATH: process.env.PATH, [key]: branch },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "AI customer service review branch cannot deploy or access databases",
      );
    }
  }
});

it("keeps P0 review non-deploying before its migration is authorized", () => {
  const branch = "fix/brand-ai-p0-quality";
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.git.deploymentEnabled[branch]).toBe(false);
  for (const key of [
    "VERCEL_GIT_COMMIT_REF",
    "WORKERS_CI_BRANCH",
    "CF_PAGES_BRANCH",
  ])
    for (const script of [
      "scripts/music-release-preflight.mjs",
      "scripts/ci-migrate.mjs",
    ]) {
      const run = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: process.env.PATH, [key]: branch },
      });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(
        "Brand AI P0 review cannot deploy or access databases",
      );
    }
});
