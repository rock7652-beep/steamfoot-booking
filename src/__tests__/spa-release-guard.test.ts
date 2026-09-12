import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA release target guard", () => {
  it("preflights compensation rows before replacing its constraint", () => {
    const sql = readFileSync("prisma/reconciliation/spa-release-schema.sql", "utf8");
    const part = sql.split("-- BEGIN compensation reconciliation")[1];
    expect(part.indexOf("RAISE EXCEPTION")).toBeLessThan(part.indexOf("DROP CONSTRAINT"));
    expect(part).toContain("value BETWEEN 0 AND 100");
    expect(part).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "SpaStaffCompensation_staffId_storeId_key"');
    expect(part).toContain('CREATE INDEX IF NOT EXISTS "SpaStaffCompensation_staffId_isActive_idx"');
    expect(part).not.toContain("DROP DEFAULT");
    expect(part).not.toMatch(/DELETE FROM|UPDATE "/);
  });
  it.each([
    ["missing", "", ""],
    ["production", "postgresql://postgres:placeholder@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres", "postgresql://postgres:placeholder@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres"],
    ["mismatched", "postgresql://postgres:placeholder@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres", "postgresql://postgres:placeholder@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres"],
    ["spoofed host", "postgresql://postgres.ttworfzgwejdeolegkxl:placeholder@untrusted.invalid/postgres", "postgresql://postgres.ttworfzgwejdeolegkxl:placeholder@untrusted.invalid/postgres"],
  ])("refuses %s connections before opening a database", (_, database, direct) => {
    const result = spawnSync(process.execPath, ["scripts/spa-release.mjs", "--apply-preview"], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH, DATABASE_URL: database, DIRECT_URL: direct },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SPA release refused");
    expect(result.stderr).not.toContain("placeholder");
  });
});
