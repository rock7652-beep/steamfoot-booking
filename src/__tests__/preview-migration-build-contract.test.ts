import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Preview migration build contract", () => {
  it("deploys Prisma migrations for Vercel Preview only", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: { build: string } };

    expect(packageJson.scripts.build).toContain('"$VERCEL_ENV" = "preview"');
    expect(packageJson.scripts.build).toContain("prisma migrate deploy");
    expect(packageJson.scripts.build).toContain("next build");
  });
});
