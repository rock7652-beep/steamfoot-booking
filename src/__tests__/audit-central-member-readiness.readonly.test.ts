import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "scripts", "audit-central-member-readiness.ts"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("central membership audit read-only contract", () => {
  it("contains no Prisma mutation or raw SQL", () => {
    expect(source).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|queryRaw|queryRawUnsafe|transaction)\s*\(/,
    );
  });

  it("does not select or print high-risk identity fields", () => {
    expect(source).not.toMatch(/\b(email|googleId|lineUserId|providerAccountId|passwordHash|access_token|refresh_token)\s*:\s*true/);
  });
});
