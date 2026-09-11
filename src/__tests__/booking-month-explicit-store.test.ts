import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("booking month explicit store scope", () => {
  const source = readFileSync("src/server/queries/booking.ts", "utf8");

  it("does not let a stale viewed-store cookie override an explicit page scope", () => {
    expect(source).toContain(
      "const hasExplicitStoreScope = activeStoreId !== undefined",
    );
    expect(source).toContain(
      'await validateStoreAccess(user, activeStoreId, "read")',
    );
    expect(source).toContain(
      'hasExplicitStoreScope && readStoreId && user.role !== "ADMIN"',
    );
  });
});
