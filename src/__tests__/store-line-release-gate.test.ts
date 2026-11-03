import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const addition = {
  storeId: "store-test", slug: "test", identityMode: "CENTRAL",
  providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903",
  liffId: "902-test", basicId: "@test", destination: "U" + "b".repeat(32),
  accessTokenEnv: "TEST_LINE_TOKEN", channelSecretEnv: "TEST_LINE_SECRET",
};
const trap = "UNEXPECTED_LINE_GATE_DATABASE_ACCESS";
const preload = `import { registerHooks } from "node:module";
registerHooks({resolve(specifier, context, next) {
  if (["pg", "@prisma/client"].includes(specifier)) throw new Error(${JSON.stringify(trap)});
  return next(specifier, context);
}});`;

function run(provider: string, raw = JSON.stringify([addition])) {
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/music-release-preflight.mjs"], {
    encoding: "utf8", timeout: 15000,
    env: {
      ...process.env, npm_config_ignore_scripts: "true", VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/soulife-line-explicit-preflight", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
      BEAUTY_MODULE_ENABLED: "0", STORE_LINE_CONFIG_JSON: "",
      STORE_LINE_ADDITIONAL_CONFIG_JSON: raw, CENTRAL_LINE_PROVIDER_ID: provider,
    },
  });
  expect(result.error).toBeUndefined();
  const output = result.stdout + result.stderr;
  expect(output).not.toContain(trap);
  return { status: result.status, output };
}

it.each(["", "999"])("blocks an unconfirmed Provider even when npm lifecycle scripts are disabled (%s)", provider => {
  const result = run(provider);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain("[store-line-additions-preflight] blocked");
});
it("validates the matching Provider through the actual first build command without DB access", () => {
  const result = run("901");
  expect(result.status).toBe(0);
  expect(result.output).toContain("[store-line-additions-preflight] passed");
});
it("does not leak malformed configuration through the build failure", () => {
  const marker = "private-invalid-config-marker";
  const result = run("901", marker);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain("[store-line-additions-preflight] blocked");
  expect(result.output).not.toContain(marker);
});
it("preserves builds without additional LINE configuration", () => {
  const result = run("", "");
  expect(result.status).toBe(0);
  expect(result.output).not.toContain("[store-line-additions-preflight]");
});
