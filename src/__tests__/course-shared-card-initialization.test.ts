import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  planSportsSharedCardInitialization,
  SHARED_CARD_INITIALIZATION_VERSION,
  type SharedCardInitializationStore,
} from "../lib/course-shared-card-initialization";

const snapshotAt = new Date("2026-10-07T10:00:00.000Z");
function store(overrides: Partial<SharedCardInitializationStore> = {}): SharedCardInitializationStore {
  return {
    storeId: "sports-store",
    industryModule: "COURSE",
    musicEnabled: false,
    sharedPlanCount: 1,
    activeSharedPlanCount: 1,
    sharedCardOverride: null,
    ...overrides,
  };
}

describe("sports shared-card one-time initialization planner (memory only)", () => {
  it("proposes one explicit store grant with absence precondition and review source", () => {
    const result = planSportsSharedCardInitialization([store()], snapshotAt);
    expect(result.mode).toBe("DRY_RUN_ONLY");
    expect(result.counts).toMatchObject({ scanned: 1, proposed: 1, skipped: 0 });
    expect(result.proposed[0]).toMatchObject({
      storeId: "sports-store",
      expectedAbsence: { storeId: "sports-store", featureKey: "shared_card", anyStateAndDate: true },
      record: {
        storeId: "sports-store", featureKey: "shared_card", status: "ENABLED",
        source: "MANUAL", startsAt: null, expiresAt: null,
      },
      reviewFlags: [],
    });
    expect(result.proposed[0].record.note).toContain(SHARED_CARD_INITIALIZATION_VERSION);
    expect(result.proposed[0].record.note).toContain(snapshotAt.toISOString());
  });

  it.each(["ENABLED", "DISABLED", "LOCKED", "HIDDEN", "UNKNOWN"])(
    "never proposes replacing an existing %s override, including past/future dates",
    (status) => {
      for (const dates of [
        { startsAt: null, expiresAt: null },
        { startsAt: new Date("2027-01-01"), expiresAt: null },
        { startsAt: null, expiresAt: new Date("2020-01-01") },
      ]) {
        const result = planSportsSharedCardInitialization([store({
          sharedCardOverride: { id: "existing", status, ...dates },
        })], snapshotAt);
        expect(result.proposed).toEqual([]);
        expect(result.skipped).toEqual([{ storeId: "sports-store", reasons: ["EXISTING_SHARED_CARD_OVERRIDE"] }]);
      }
    },
  );

  it.each(["STEAMFOOT", "SPA", "FUTURE_MODULE", ""])("excludes unsupported module %s", (industryModule) => {
    const result = planSportsSharedCardInitialization([store({ industryModule })], snapshotAt);
    expect(result.counts.proposed).toBe(0);
    expect(result.skipped[0].reasons).toEqual(["UNSUPPORTED_INDUSTRY_MODULE"]);
  });

  it("excludes a music profile even when a shared plan exists", () => {
    const result = planSportsSharedCardInitialization([store({ musicEnabled: true })], snapshotAt);
    expect(result.proposed).toEqual([]);
    expect(result.skipped[0].reasons).toEqual(["MUSIC_ENABLED"]);
  });

  it("leaves stores without a current shared plan ungranted", () => {
    const result = planSportsSharedCardInitialization([store({ sharedPlanCount: 0, activeSharedPlanCount: 0 })], snapshotAt);
    expect(result.proposed).toEqual([]);
    expect(result.skipped[0].reasons).toEqual(["NO_CURRENT_SHARED_PLAN"]);
  });

  it("counts inactive persisted shared plans but visibly flags inactive-only candidates", () => {
    const result = planSportsSharedCardInitialization([store({ sharedPlanCount: 2, activeSharedPlanCount: 0 })], snapshotAt);
    expect(result.counts).toMatchObject({ proposed: 1, inactiveOnlyProposed: 1 });
    expect(result.proposed[0].reviewFlags).toEqual(["INACTIVE_SHARED_PLANS_ONLY"]);
    expect(result.proposed[0].evidence).toMatchObject({ sharedPlanCount: 2, activeSharedPlanCount: 0 });
  });

  it("reports all skip reasons and reconcilable totals without losing overlapping reasons", () => {
    const result = planSportsSharedCardInitialization([
      store({ storeId: "a" }),
      store({ storeId: "b", industryModule: "SPA", musicEnabled: true, sharedPlanCount: 0, activeSharedPlanCount: 0,
        sharedCardOverride: { id: "existing", status: "HIDDEN", startsAt: null, expiresAt: null } }),
    ], snapshotAt);
    expect(result.counts).toEqual({
      scanned: 2, proposed: 1, skipped: 1, inactiveOnlyProposed: 0,
      skipReasons: { EXISTING_SHARED_CARD_OVERRIDE: 1, UNSUPPORTED_INDUSTRY_MODULE: 1, MUSIC_ENABLED: 1, NO_CURRENT_SHARED_PLAN: 1 },
    });
  });

  it("is deterministic, does not mutate its snapshot, and proposes one row per store", () => {
    const a = store({ storeId: "a", sharedPlanCount: 10, activeSharedPlanCount: 2 });
    const b = store({ storeId: "b" });
    const input = Object.freeze([Object.freeze(b), Object.freeze(a)]);
    const result = planSportsSharedCardInitialization(input, snapshotAt);
    expect(result).toEqual(planSportsSharedCardInitialization([a, b], snapshotAt));
    expect(result.proposed.map((proposal) => proposal.storeId)).toEqual(["a", "b"]);
    expect(input.map((row) => row.storeId)).toEqual(["b", "a"]);
  });

  it("is idempotent after proposed records exist, without replacing any other override", () => {
    const result = planSportsSharedCardInitialization([store()], snapshotAt);
    const appliedFixture = store({ sharedCardOverride: { id: "new", ...result.proposed[0].record } });
    expect(planSportsSharedCardInitialization([appliedFixture], snapshotAt).proposed).toEqual([]);
  });

  it("only emits allowlisted store identifiers, counts and initialization metadata", () => {
    const extra = { ...store(), phone: "DO_NOT_EMIT_PHONE", email: "DO_NOT_EMIT_EMAIL", name: "DO_NOT_EMIT_NAME" };
    expect(JSON.stringify(planSportsSharedCardInitialization([extra], snapshotAt))).not.toContain("DO_NOT_EMIT");
  });

  it("handles an empty snapshot without fabricating stores", () => {
    expect(planSportsSharedCardInitialization([], snapshotAt).counts).toMatchObject({ scanned: 0, proposed: 0, skipped: 0 });
  });

  it.each([
    { sharedPlanCount: -1 }, { sharedPlanCount: 0.5 }, { sharedPlanCount: Number.NaN },
    { activeSharedPlanCount: -1 }, { activeSharedPlanCount: 2 },
  ])("rejects invalid snapshot counts %j", (counts) => {
    expect(() => planSportsSharedCardInitialization([store(counts)], snapshotAt)).toThrow("invalid shared-plan counts");
  });

  it("rejects duplicate IDs, empty IDs and invalid timestamps", () => {
    expect(() => planSportsSharedCardInitialization([store(), store()], snapshotAt)).toThrow("duplicate store ID");
    expect(() => planSportsSharedCardInitialization([store({ storeId: " " })], snapshotAt)).toThrow("empty");
    expect(() => planSportsSharedCardInitialization([], new Date("invalid"))).toThrow("timestamp");
  });
});

describe("read-only initialization script static safeguards (script never executed)", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts/plan-sports-shared-card-initialization.ts"), "utf8");
  const ast = ts.createSourceFile("initialization.ts", source, ts.ScriptTarget.Latest, true);
  const statements: { method: string; sql: string }[] = [];
  const calls: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node) && ts.isPropertyAccessExpression(node.tag)) {
      statements.push({ method: node.tag.name.text, sql: node.template.getText(ast).slice(1, -1).trim() });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      calls.push(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);

  it("requires the exact dry-run flag and explicit dedicated URL before client creation", () => {
    expect(source).toContain('args.length !== 1 || args[0] !== "--dry-run"');
    expect(source.indexOf('args.length !== 1')).toBeLessThan(source.indexOf("new PrismaClient"));
    expect(source.indexOf("if (!databaseUrl)")).toBeLessThan(source.indexOf("new PrismaClient"));
    expect(source.match(/process\.env\.\w+/g)).toEqual(["process.env.SHARED_CARD_INITIALIZATION_DATABASE_URL"]);
    expect(source).toContain("datasources: { db: { url: databaseUrl } }");
    expect(source).not.toMatch(/(?:dotenv|lib\/db|database-url|DIRECT_URL|process\.env\[)/);
    expect(source).toContain('import.meta.url === pathToFileURL(resolve(process.argv[1])).href');
  });

  it("uses only transaction READ ONLY followed by SELECT queries in a consistent snapshot", () => {
    expect(statements).toHaveLength(3);
    expect(statements[0]).toEqual({ method: "$executeRaw", sql: "SET TRANSACTION READ ONLY" });
    for (const statement of statements.slice(1)) {
      expect(statement.method).toBe("$queryRaw");
      expect(statement.sql).toMatch(/^SELECT\s/);
      expect(statement.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY)\b/i);
    }
    expect(source).toContain('snapshot.readOnly !== "on"');
    expect(source).toContain('isolationLevel: "RepeatableRead"');
    for (const method of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "$executeRawUnsafe", "$queryRawUnsafe"]) {
      expect(calls).not.toContain(method);
    }
  });

  it("scopes evidence to each store and never filters shared-card overrides by state/date", () => {
    const sql = statements[2].sql;
    expect(sql).toContain('m."storeId" = s.id');
    expect(sql).toContain("m.status::text = 'ENABLED'");
    expect(sql).toContain('p."storeId" = s.id');
    expect(sql).toContain('e."storeId" = s.id AND e."featureKey" = \'shared_card\'');
    expect(sql).not.toMatch(/\b(?:WHERE|AND)\s+e\.(?:status|"(?:startsAt|expiresAt)")/);
    expect(sql).not.toMatch(/m\."(?:startsAt|expiresAt)"/);
  });

  it("reads no contacts/members/bookings and never logs raw errors or the connection URL", () => {
    const sql = statements.map((statement) => statement.sql).join("\n");
    expect(sql).not.toMatch(/\b(?:phone|email|customer|CourseCardMember|CourseBooking|CoursePointCard)\b/i);
    expect(source).toContain("log: []");
    expect(source).not.toMatch(/console\.\w+\([^\n]*(?:databaseUrl|parsedUrl|error\.|error\))/);
    expect(source).toContain("NOT been run against any database");
  });
});
