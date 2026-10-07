import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sports shared-card stacked PR checks", () => {
  it("runs core CI for the exact stacked base without removing existing triggers", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const trigger = source.split("permissions:")[0];
    expect(trigger).toContain("- main");
    expect(trigger).toContain("- codex/course-scheduling-stage1");
    expect(trigger).toContain("- feat/hq-store-real-view-20261007");
    for (const check of ["changed-lint:", "targeted-tests:", "typecheck:", "full-vitest-baseline:"]) expect(source).toContain(check);
  });

  it("executes all seven companion scenarios against a disposable local PostgreSQL service, without secrets", () => {
    const source = readFileSync(".github/workflows/sports-shared-card-audit.yml", "utf8");
    expect(source).toContain("branches: [main, feat/hq-store-real-view-20261007]");
    expect(source).toContain("postgres:17.6");
    for (const key of ["DATABASE_URL", "DIRECT_URL", "BOOKING_CONCURRENCY_TEST_DATABASE_URL"]) {
      expect(source).toContain(`${key}: postgresql://postgres:disposable-test-only@127.0.0.1:5432/sports_shared_card_test`);
    }
    expect(source).toContain("npx vitest run src/__tests__/course-companions.pg.test.ts");
    expect(source).toContain("!r.success");
    expect(source).toContain("r.numTotalTests !== 7");
    expect(source).toContain("r.numPassedTests !== 7");
    expect(source).toContain("r.numPendingTests !== 0");
    expect(source).not.toContain("secrets.");
    expect(source).not.toContain("continue-on-error");
    expect(source).not.toContain("supabase.co");
    expect(source).not.toContain("npm run build");
  });
});
