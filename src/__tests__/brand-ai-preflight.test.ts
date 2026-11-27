import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  inspectBrandAiConfig,
  readOnlyConnection,
} from "../../scripts/brand-line-ai-preflight";
afterEach(() => vi.unstubAllEnvs());
it("reports only presence/counts, never actual credentials or whitelist IDs", () => {
  const key = randomUUID(),
    id = randomUUID();
  vi.stubEnv("OPENAI_API_KEY", key);
  vi.stubEnv("BRAND_AI_ALLOWED_LINE_USER_IDS", `${id},${id},`);
  vi.stubEnv("BRAND_AI_ENABLED", "0");
  vi.stubEnv("PRODUCTION_MIGRATION_TARGET", "synthetic-target");
  const result = inspectBrandAiConfig(),
    serialized = JSON.stringify(result);
  expect(result.enabled).toBe(false);
  expect(result.productionMigrationTargetPresent).toBe(true);
  expect(result.whitelistCount).toBe(1);
  expect(serialized).not.toContain(key);
  expect(serialized).not.toContain(id);
  expect(result.restrictedKeyAndProviderHardBudget).toBe(
    "manual_verification_required",
  );
});
it("pins the explicit target and enforces strict TLS without Prisma URL overrides", () => {
  const ref = "ttworfzgwejdeolegkxl",
    url = new URL("postgresql://localhost/postgres");
  url.hostname = "aws-1-ap-northeast-1.pooler.supabase.com";
  url.username = `synthetic.${ref}`;
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("pgbouncer", "true");
  const result = readOnlyConnection(ref, url.toString());
  expect(result.ssl.rejectUnauthorized).toBe(true);
  expect(new URL(result.connectionString).search).toBe("");
  expect(() =>
    readOnlyConnection("qijlnhtpbintanzpxkvf", url.toString()),
  ).toThrow("TARGET_MISMATCH");
  for (const [key, value] of [
    ["sslmode", "disable"],
    ["options", "-c search_path=private"],
    ["sslaccept", "accept_invalid_certs"],
    ["sslcert", "/tmp/unknown-ca"],
  ]) {
    const invalid = new URL(url);
    invalid.searchParams.set(key, value);
    expect(() => readOnlyConnection(ref, invalid.toString())).toThrow();
  }
  expect(() =>
    readOnlyConnection(ref, "postgresql://localhost/postgres"),
  ).toThrow("TARGET_MISMATCH");
});
