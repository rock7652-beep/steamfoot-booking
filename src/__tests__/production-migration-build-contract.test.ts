import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/ci-migrate.mjs"),
  "utf8",
);
const scriptPath = resolve(process.cwd(), "scripts/ci-migrate.mjs");

describe("Production migration build guard", () => {
  it("skips every environment except Vercel Production", () => {
    expect(script).toContain("process.env.VERCEL_ENV !== EXPECTED_ENVIRONMENT");
    expect(script).toContain("skipped outside Vercel Production");

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "preview" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skipped outside Vercel Production");
  });

  it("stops before Prisma when the Production build has no credentials", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "",
        DIRECT_URL: "",
        VERCEL_ENV: "production",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL is missing");
  });

  it("allows only the payment-split migration on the approved Production pooler", () => {
    expect(script).toContain('const EXPECTED_PROJECT_REF = "qijlnhtpbintanzpxkvf"');
    expect(script).toContain('const EXPECTED_MIGRATION = "20260801090000_add_transaction_payment_splits"');
    expect(script).toContain('url.port !== "5432"');
    expect(script).toContain("pending.length !== 1");
    expect(script).toContain('runPrisma(["migrate", "deploy"])');
  });

  it("does not provide a manual SQL fallback", () => {
    expect(script).not.toContain("db execute");
    expect(script).not.toContain("$executeRaw");
  });
});
