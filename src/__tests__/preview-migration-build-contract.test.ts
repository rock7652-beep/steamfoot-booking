import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel migration build contract", () => {
  it("delegates migrations to the guarded Production-only script", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: { build: string } };

    expect(packageJson.scripts.build).toContain("node scripts/ci-migrate.mjs");
    expect(packageJson.scripts.build).not.toContain("prisma migrate deploy");
    expect(packageJson.scripts.build).toContain("next build");
  });
});
