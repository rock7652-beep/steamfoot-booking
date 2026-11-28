import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { brandLineLocalPostgres } from "../../scripts/qa/brand-line-local-postgres.mjs";
import {
  claimLimitedBrandAiReply,
  reserveBrandAiCall,
  releaseBrandAiCall,
} from "@/server/services/brand-ai-quota";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { handleBrandAiText } from "@/server/services/brand-ai-reply";
import { BRAND_AI_FAQ } from "@/lib/brand-ai-faq";
import { BRAND_AI_HANDOFF } from "@/server/services/brand-ai-provider";
import { inspectBrandAiDatabase } from "../../scripts/brand-line-ai-preflight";
const reply = vi.hoisted(() =>
  vi.fn<(token: string, messages: unknown[]) => Promise<{ success: boolean }>>(
    async () => ({ success: true }),
  ),
);
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/line", () => ({ replySteamButlerMessage: reply }));
vi.mock("@/lib/line-delivery-pause", () => ({
  isSystemLineDeliveryPaused: () => false,
}));
vi.mock("@/lib/runtime-env", () => ({
  isPreviewExternalIntegrationBlocked: () => false,
}));
vi.mock("@/lib/line-config", () => ({
  getSteamButlerLineAccessToken: () => "synthetic",
  getSteamButlerLineSecret: () => "synthetic",
}));
const enabled = process.env.BRAND_AI_PG_TESTS === "1";
let fixture: Awaited<ReturnType<typeof brandLineLocalPostgres>>,
  a: PrismaClient,
  b: PrismaClient;
beforeAll(async () => {
  if (!enabled) return;
  fixture = await brandLineLocalPostgres();
  a = new PrismaClient({ datasources: { db: { url: fixture.url } } });
  b = new PrismaClient({ datasources: { db: { url: fixture.url } } });
}, 30_000);
beforeEach(async () => {
  reply.mockClear();
  if (enabled) await fixture.admin.query('TRUNCATE "BrandAiReplyLog"');
});

it.skipIf(!enabled)(
  "actual reply service sends 20 approved answers, falls back at 21 and deduplicates replay",
  async () => {
    const userId = `synthetic-${randomUUID()}`;
    const env = {
      BRAND_AI_ENABLED: "1",
      BRAND_AI_ALLOWED_LINE_USER_IDS: userId,
      OPENAI_API_KEY: randomUUID(),
    };
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 5 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ action: "answer", faqIds: ["Q1"] }),
              },
            ],
          },
        ],
      }),
    );
    const first = {
      sourceType: "user",
      userId,
      webhookEventId: randomUUID(),
      replyToken: randomUUID(),
      text: "品牌介紹",
    };
    for (let i = 0; i < 21; i++)
      await handleBrandAiText(
        {
          ...first,
          ...(i
            ? { webhookEventId: randomUUID(), replyToken: randomUUID() }
            : {}),
        },
        vi.fn(),
        { env, transport, database: i % 2 ? a : b },
      );
    await handleBrandAiText(first, vi.fn(), { env, transport, database: b });
    expect(transport).toHaveBeenCalledTimes(20);
    expect(reply).toHaveBeenCalledTimes(21);
    expect(reply.mock.calls[0]).toEqual([
      first.replyToken,
      [{ type: "text", text: BRAND_AI_FAQ[0].answer }],
      { format: "native-text" },
    ]);
    expect(reply.mock.calls[20][1]).toEqual([
      { type: "text", text: BRAND_AI_HANDOFF },
    ]);
    expect(
      await a.brandAiReplyLog.count({ where: { outcome: "ANSWER" } }),
    ).toBe(20);
    expect(
      await a.brandAiReplyLog.count({
        where: { modelLeaseUntil: { not: null } },
      }),
    ).toBe(0);
  },
  30_000,
);

it.skipIf(!enabled)(
  "does not hold a database transaction over the model wait",
  async () => {
    const userId = `synthetic-${randomUUID()}`,
      env = {
        BRAND_AI_ENABLED: "1",
        BRAND_AI_ALLOWED_LINE_USER_IDS: userId,
        OPENAI_API_KEY: randomUUID(),
      };
    let started!: () => void, finish!: (response: Response) => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = vi.fn<typeof fetch>(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const input = {
      sourceType: "user",
      userId,
      webhookEventId: randomUUID(),
      replyToken: randomUUID(),
      text: "品牌介紹",
    };
    const first = handleBrandAiText(input, vi.fn(), {
      env,
      transport,
      database: a,
    });
    await waiting;
    await handleBrandAiText(
      { ...input, webhookEventId: randomUUID() },
      vi.fn(),
      { env, transport, database: b },
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledTimes(1);
    finish(
      Response.json({
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 5 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ action: "answer", faqIds: ["Q1"] }),
              },
            ],
          },
        ],
      }),
    );
    await first;
    expect(
      await a.brandAiReplyLog.count({ where: { outcome: "ANSWER" } }),
    ).toBe(1);
  },
  30_000,
);

it.skipIf(!enabled)(
  "runs catalog/ACL preflight read-only without changing records",
  async () => {
    const before = await a.brandAiReplyLog.count();
    await fixture.admin.query("SET ROLE brand_line_runtime");
    let result;
    try {
      result = await inspectBrandAiDatabase(fixture.admin);
    } finally {
      await fixture.admin.query("RESET ROLE");
    }
    expect(result.schemaReady).toBe(true);
    expect(result.context.read_only).toBe("on");
    expect(result.rights).toMatchObject({
      owner: false,
      bypass: false,
      can_select: true,
      can_insert: true,
      can_update: true,
      advisory_lock: true,
    });
    expect(await a.brandAiReplyLog.count()).toBe(before);
  },
);
afterAll(async () => {
  if (enabled) {
    await a?.$disconnect();
    await b?.$disconnect();
    await fixture?.close();
  }
});
const claim = async (db = a) =>
  (await db.brandAiReplyLog.create({ data: { webhookEventId: randomUUID() } }))
    .webhookEventId;

it.skipIf(!enabled)(
  "allows exactly 20 attempts across clients; failures never refund",
  async () => {
    for (let i = 0; i < 20; i++) {
      const db = i % 2 ? a : b,
        id = await claim(db);
      expect(await reserveBrandAiCall(id, db)).toBe("allowed");
      await releaseBrandAiCall(id, db);
    }
    expect(await reserveBrandAiCall(await claim(b), b)).toBe("daily_limit");
    expect(
      await a.brandAiReplyLog.count({
        where: { modelStartedAt: { not: null } },
      }),
    ).toBe(20);
    expect(await a.brandAiReplyLog.count({ where: { outcome: "ERROR" } })).toBe(
      21,
    );
  },
  30_000,
);
it.skipIf(!enabled)(
  "serializes two clients contesting the final daily slot",
  async () => {
    const [{ now }] = await a.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    await a.brandAiReplyLog.createMany({
      data: Array.from({ length: 19 }, () => ({
        webhookEventId: randomUUID(),
        modelStartedAt: now,
      })),
    });
    const ids = await Promise.all([claim(a), claim(b)]);
    const result = await Promise.all([
      reserveBrandAiCall(ids[0], a),
      reserveBrandAiCall(ids[1], b),
    ]);
    expect(result.sort()).toEqual(["allowed", "daily_limit"]);
    expect(
      await a.brandAiReplyLog.count({
        where: { modelStartedAt: { not: null } },
      }),
    ).toBe(20);
  },
);
it.skipIf(!enabled)(
  "keeps concurrency global across Taiwan midnight; crash lease expiry retains history",
  async () => {
    const [{ now }] = await a.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const start = dayRange(toLocalDateStr(now)).start;
    const old = await a.brandAiReplyLog.create({
      data: {
        webhookEventId: randomUUID(),
        modelStartedAt: new Date(start.getTime() - 1),
        modelLeaseUntil: new Date(now.getTime() + 30_000),
      },
    });
    const id = await claim(b);
    expect(await reserveBrandAiCall(id, b)).toBe("concurrent_limit");
    await a.brandAiReplyLog.update({
      where: { webhookEventId: old.webhookEventId },
      data: { modelLeaseUntil: new Date(now.getTime() - 1) },
    });
    expect(await reserveBrandAiCall(id, b)).toBe("allowed");
    expect(
      (
        await a.brandAiReplyLog.findUniqueOrThrow({
          where: { webhookEventId: old.webhookEventId },
        })
      ).modelStartedAt,
    ).toEqual(old.modelStartedAt);
    expect(await reserveBrandAiCall(await claim(a), a)).toBe(
      "concurrent_limit",
    );
    await releaseBrandAiCall(id, b);
    expect(await reserveBrandAiCall(id, b)).toBe("already_reserved");
  },
);
it.skipIf(!enabled)(
  "rolls back quota errors; runtime cannot DELETE/TRUNCATE/ALTER",
  async () => {
    const id = await claim();
    await fixture.admin
      .query(`CREATE FUNCTION local_quota_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."modelStartedAt" IS NOT NULL THEN RAISE EXCEPTION 'LOCAL_QUOTA_FAULT';END IF;RETURN NEW;END $$;
    CREATE TRIGGER local_quota_fault BEFORE UPDATE ON "BrandAiReplyLog" FOR EACH ROW EXECUTE FUNCTION local_quota_fault()`);
    await expect(reserveBrandAiCall(id, a)).rejects.toThrow();
    expect(
      (
        await a.brandAiReplyLog.findUniqueOrThrow({
          where: { webhookEventId: id },
        })
      ).modelStartedAt,
    ).toBe(null);
    await fixture.admin.query(
      'DROP TRIGGER local_quota_fault ON "BrandAiReplyLog";DROP FUNCTION local_quota_fault()',
    );
    expect(await reserveBrandAiCall(id, b)).toBe("allowed");
    await expect(
      a.$executeRaw`DELETE FROM "BrandAiReplyLog"`,
    ).rejects.toThrow();
    await expect(a.$executeRaw`TRUNCATE "BrandAiReplyLog"`).rejects.toThrow();
    await expect(
      a.$executeRaw`ALTER TABLE "BrandAiReplyLog" ADD COLUMN forbidden text`,
    ).rejects.toThrow();
  },
);

it.skipIf(!enabled)(
  "exact isolated runtime proposal can be revoked without deleting history",
  async () => {
    const event = randomUUID();
    await a.brandAiReplyLog.create({
      data: { webhookEventId: event, outcome: "ERROR" },
    });
    await fixture.admin.query(
      readFileSync(
        "scripts/sql/brand-line-ai/preview-runtime-revoke.proposed.sql",
        "utf8",
      ).replaceAll("steamfoot_ai_preview_20261125", "brand_line_runtime"),
    );
    try {
      await expect(a.brandAiReplyLog.count()).rejects.toThrow();
      expect(
        (
          await fixture.admin.query(
            'SELECT count(*)::int AS n FROM "BrandAiReplyLog"',
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await fixture.admin.query(
        readFileSync(
          "scripts/sql/brand-line-ai/preview-runtime.proposed.sql",
          "utf8",
        ).replaceAll("steamfoot_ai_preview_20261125", "brand_line_runtime"),
      );
    }
  },
);

it.skipIf(!enabled)(
  "bounds the full reply service to three new claims without resetting history",
  async () => {
    await a.brandAiReplyLog.createMany({
      data: Array.from({ length: 4 }, () => ({
        webhookEventId: randomUUID(),
        outcome: "ERROR" as const,
      })),
    });
    const userId = `synthetic-${randomUUID()}`;
    const env = {
      BRAND_AI_ENABLED: "1",
      BRAND_AI_ALLOWED_LINE_USER_IDS: userId,
      OPENAI_API_KEY: "synthetic",
      BRAND_AI_REPLY_LOG_LIMIT: "7",
    };
    const transport = vi.fn<typeof fetch>();
    transport.mockImplementation(async () =>
      Response.json({
        status: "completed",
        usage: { input_tokens: 1, output_tokens: 1 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ action: "answer", faqIds: ["Q3"] }),
              },
            ],
          },
        ],
      }),
    );
    const first = {
      userId,
      sourceType: "user",
      text: "試用",
      webhookEventId: randomUUID(),
      replyToken: "synthetic",
    };
    for (let i = 0; i < 6; i++)
      await handleBrandAiText(
        {
          ...first,
          webhookEventId: i === 0 ? first.webhookEventId : randomUUID(),
        },
        vi.fn(),
        { env, transport, database: i % 2 ? a : b },
      );
    await handleBrandAiText(first, vi.fn(), { env, transport, database: b });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(reply).toHaveBeenCalledTimes(3);
    expect(await a.brandAiReplyLog.count()).toBe(7);
    expect(
      await a.brandAiReplyLog.count({
        where: { modelStartedAt: { not: null } },
      }),
    ).toBe(3);
    expect(
      reply.mock.calls.every(
        (call) =>
          call[1][0] && (call[1][0] as { type: string }).type === "text",
      ),
    ).toBe(true);
  },
  30000,
);

it.skipIf(!enabled)(
  "serializes the absolute claim ceiling across clients; failures consume it",
  async () => {
    const claimed = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        claimLimitedBrandAiReply(randomUUID(), 3, i % 2 ? a : b),
      ),
    );
    expect(claimed.filter(Boolean)).toHaveLength(3);
    expect(await a.brandAiReplyLog.count()).toBe(3);
    expect(await claimLimitedBrandAiReply(randomUUID(), 3, a)).toBe(false);
  },
);

it.skipIf(!enabled)(
  "counts the correction as a second call but keeps one reply claim",
  async () => {
    const id = randomUUID();
    expect(await claimLimitedBrandAiReply(id, 1, a)).toBe(true);
    expect(await reserveBrandAiCall(id, a, 60000, 1, 2)).toBe("allowed");
    expect(await reserveBrandAiCall(id, b, 60000, 2, 2)).toBe("allowed");
    expect(await reserveBrandAiCall(id, a, 60000, 2, 2)).toBe(
      "absolute_call_limit",
    );
    await releaseBrandAiCall(id, a);
    expect(await a.brandAiReplyLog.count()).toBe(1);
    const row = await a.brandAiReplyLog.findUniqueOrThrow({
      where: { webhookEventId: id },
    });
    expect(row.modelStartedAt).not.toBeNull();
    expect(row.repairStartedAt).not.toBeNull();
    expect(await claimLimitedBrandAiReply(randomUUID(), 1, b)).toBe(false);
  },
);
it.skipIf(!enabled)(
  "serializes competing corrections on the last absolute call slot",
  async () => {
    const id = randomUUID();
    await claimLimitedBrandAiReply(id, 1, a);
    await reserveBrandAiCall(id, a, 60000, 1, 2);
    const results = await Promise.all([
      reserveBrandAiCall(id, a, 60000, 2, 2),
      reserveBrandAiCall(id, b, 60000, 2, 2),
    ]);
    expect(results.sort()).toEqual(["absolute_call_limit", "allowed"]);
  },
);
it.skipIf(!enabled)(
  "does not allow a correction after its owned concurrency lease expires",
  async () => {
    const id = randomUUID();
    await claimLimitedBrandAiReply(id, 1, a);
    await reserveBrandAiCall(id, a, 60000, 1, 2);
    await fixture.admin.query(
      'UPDATE "BrandAiReplyLog" SET "modelLeaseUntil"=clock_timestamp()-interval \'1 second\'',
    );
    expect(await reserveBrandAiCall(id, b, 60000, 2, 2)).toBe(
      "already_reserved",
    );
    expect(
      (
        await a.brandAiReplyLog.findUniqueOrThrow({
          where: { webhookEventId: id },
        })
      ).repairStartedAt,
    ).toBeNull();
  },
);
it.skipIf(!enabled)(
  "counts yesterday's first call and today's correction on their own business days",
  async () => {
    const id = randomUUID();
    await claimLimitedBrandAiReply(id, 30, a);
    await fixture.admin.query(
      'UPDATE "BrandAiReplyLog" SET "modelStartedAt"=clock_timestamp()-interval \'2 days\',"repairStartedAt"=clock_timestamp()',
    );
    const range = dayRange(toLocalDateStr());
    for (let i = 0; i < 19; i++)
      await fixture.admin.query(
        'INSERT INTO "BrandAiReplyLog"("webhookEventId","modelStartedAt") VALUES($1,$2)',
        [randomUUID(), range.start],
      );
    const next = randomUUID();
    await claimLimitedBrandAiReply(next, 30, b);
    expect(await reserveBrandAiCall(next, b, 60000, 1, 30)).toBe("daily_limit");
  },
);
it.skipIf(!enabled)(
  "rolls back a failed correction reservation without releasing its first call",
  async () => {
    const id = randomUUID();
    await claimLimitedBrandAiReply(id, 1, a);
    await reserveBrandAiCall(id, a, 60000, 1, 2);
    await fixture.admin
      .query(`CREATE FUNCTION fail_p0_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."repairStartedAt" IS NOT NULL THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_p0_correction BEFORE UPDATE ON "BrandAiReplyLog" FOR EACH ROW EXECUTE FUNCTION fail_p0_correction()`);
    try {
      await expect(reserveBrandAiCall(id, b, 60000, 2, 2)).rejects.toThrow();
    } finally {
      await fixture.admin.query(
        'DROP TRIGGER fail_p0_correction ON "BrandAiReplyLog"; DROP FUNCTION fail_p0_correction()',
      );
    }
    const row = await a.brandAiReplyLog.findUniqueOrThrow({
      where: { webhookEventId: id },
    });
    expect(row.modelStartedAt).not.toBeNull();
    expect(row.repairStartedAt).toBeNull();
  },
);

it.skipIf(!enabled)(
  "P0 rollback is pristine-only and retains registered or active diagnostics",
  async () => {
    const probe = await brandLineLocalPostgres();
    const rollback = readFileSync(
      "scripts/sql/brand-line-ai/p0-rollback.proposed.sql",
      "utf8",
    );
    const install = readFileSync(
      "prisma/migrations/20261128073000_brand_ai_p0_diagnostics/migration.sql",
      "utf8",
    );
    try {
      await probe.admin.query(rollback);
      expect(
        (
          await probe.admin.query(
            `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='BrandAiReplyLog' AND column_name IN('repairStartedAt','diagnostics')`,
          )
        ).rows[0].n,
      ).toBe(0);
      await probe.admin.query(install);
      await probe.admin.query(
        'CREATE TABLE "_prisma_migrations"(migration_name text)',
      );
      await probe.admin.query('INSERT INTO "_prisma_migrations" VALUES($1)', [
        "20261128073000_brand_ai_p0_diagnostics",
      ]);
      await expect(probe.admin.query(rollback)).rejects.toThrow(
        "P0_REGISTERED_RETAIN_SCHEMA",
      );
      await probe.admin.query("ROLLBACK");
      await probe.admin.query('DROP TABLE "_prisma_migrations"');
      await probe.admin.query(
        'INSERT INTO "BrandAiReplyLog"("webhookEventId",diagnostics) VALUES($1,$2)',
        [randomUUID(), { attempts: 0, route: "uncertain", failures: [] }],
      );
      await expect(probe.admin.query(rollback)).rejects.toThrow(
        "P0_ACTIVITY_RETAIN_AUDIT",
      );
      await probe.admin.query("ROLLBACK");
      expect(
        (
          await probe.admin.query(
            'SELECT count(*)::int AS n FROM "BrandAiReplyLog"',
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await probe.close();
    }
  },
  30000,
);
