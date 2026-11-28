import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { brandLineLocalPostgres } from "../../scripts/qa/brand-line-local-postgres.mjs";
import { handleBrandAiText } from "@/server/services/brand-ai-reply";
import {
  loadBrandMemory,
  saveBrandMemory,
  brandMemoryCurrent,
  purgeExpiredBrandMemory,
  brandMemoryKey,
} from "@/server/services/brand-ai-memory";
import {
  emptyBrandProfile,
  type BrandProfile,
} from "@/server/services/brand-ai-dialogue";

const mocks = vi.hoisted(() => ({ reply: vi.fn(), paused: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/line", () => ({ replySteamButlerMessage: mocks.reply }));
vi.mock("@/lib/line-delivery-pause", () => ({
  isSystemLineDeliveryPaused: mocks.paused,
}));
vi.mock("@/lib/runtime-env", () => ({
  isPreviewExternalIntegrationBlocked: () => false,
}));
vi.mock("@/lib/line-config", () => ({
  getSteamButlerLineAccessToken: () => "synthetic",
  getSteamButlerLineSecret: () => "local-only-channel-secret",
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
}, 30000);
beforeEach(async () => {
  mocks.reply.mockReset().mockResolvedValue({ success: true });
  mocks.paused.mockReset().mockReturnValue(false);
  if (enabled)
    await fixture.admin.query(
      'TRUNCATE "BrandAiConversation", "BrandAiReplyLog"',
    );
});
afterAll(async () => {
  if (enabled) {
    await a.$disconnect();
    await b.$disconnect();
    await fixture.close();
  }
});
const actor = () => `synthetic-${randomUUID()}`;
const env = (userId: string) => ({
  BRAND_AI_ENABLED: "1",
  BRAND_AI_VERSION: "2",
  BRAND_AI_ALLOWED_LINE_USER_IDS: userId,
  OPENAI_API_KEY: "synthetic",
});
const input = (userId: string, text = "美甲店兩人，適合什麼方案？") => ({
  userId,
  text,
  sourceType: "user",
  replyToken: "synthetic-reply",
  webhookEventId: randomUUID(),
});
const learned: BrandProfile = {
  ...emptyBrandProfile,
  industry: "beauty",
  staffCount: 2,
  storeCount: 1,
  mode: "appointment",
  needs: ["booking"],
  plan: "BASIC",
};
function response(
  profile = learned,
  text = "美甲工作室可以先看基本版，每期 NT$1480，月繳最低承諾12個月。",
  sourceIds = ["plan-BASIC"],
) {
  const extracted = {
    industry: profile.industry,
    staffCount: profile.staffCount,
    storeCount: profile.storeCount,
    mode: profile.mode,
    needs: profile.needs,
    plan: profile.plan,
  };
  return Response.json({
    status: "completed",
    usage: { input_tokens: 2000, output_tokens: 100 },
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              action: "answer",
              answer: text,
              sourceIds,
              profile: extracted,
            }),
          },
        ],
      },
    ],
  });
}

it.skipIf(!enabled)(
  "full reply path learns needs, answers a follow-up and isolates another customer",
  async () => {
    const user = actor(),
      other = actor(),
      log = vi.fn();
    const fake = vi.fn<typeof fetch>(async () => response());
    const first = input(user);
    await handleBrandAiText(first, log, {
      env: env(user),
      transport: fake,
      database: a,
    });
    await handleBrandAiText(input(user, "那個可以免費試用嗎？"), log, {
      env: env(user),
      transport: fake.mockImplementation(async () =>
        response(
          learned,
          "可以免費體驗30天，申請網址：\nhttps://www.steamfoot.com/apply",
          ["trial"],
        ),
      ),
      database: b,
    });
    const second = JSON.parse(
      JSON.parse(String(fake.mock.calls[1][1]?.body)).input[0].content,
    );
    expect(second.profile).toMatchObject({
      industry: "beauty",
      staffCount: 2,
      storeCount: 1,
      plan: "BASIC",
      lastSources: ["plan-BASIC"],
    });
    await handleBrandAiText(input(other, "你好"), log, {
      env: env(other),
      transport: fake,
      database: a,
    });
    const third = JSON.parse(
      JSON.parse(String(fake.mock.calls[2][1]?.body)).input[0].content,
    );
    expect(third.profile).toEqual(emptyBrandProfile);
    expect(await a.brandAiConversation.count()).toBe(2);
    const stored = JSON.stringify(await a.brandAiConversation.findMany());
    for (const privateValue of [user, other, first.text])
      expect(stored).not.toContain(privateValue);
    expect(JSON.stringify(log.mock.calls)).not.toContain(user);
    expect(mocks.reply).toHaveBeenNthCalledWith(
      2,
      "synthetic-reply",
      [
        {
          type: "text",
          text: "可以免費體驗30天，申請網址：\nhttps://www.steamfoot.com/apply",
        },
      ],
      { format: "native-text", timeoutMs: 8000 },
    );
    const saved = await a.brandAiReplyLog.findUniqueOrThrow({
      where: { webhookEventId: first.webhookEventId },
    });
    expect(saved.knowledgeIds).toEqual(["plan-BASIC"]);
    expect(saved.knowledgeVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await a.brandAiReplyLog.count({
        where: { modelLeaseUntil: { not: null } },
      }),
    ).toBe(0);
    // Same event does not send, call provider or overwrite context a second time.
    await handleBrandAiText(first, log, {
      env: env(user),
      transport: fake,
      database: b,
    });
    expect(fake).toHaveBeenCalledTimes(3);
    expect(mocks.reply).toHaveBeenCalledTimes(3);
  },
  30000,
);

it.skipIf(!enabled)(
  "fixed expiry, generation and revision reject stale writes and preserve other scopes",
  async () => {
    const user = actor(),
      other = actor();
    const old = await loadBrandMemory(user, a),
      untouched = await loadBrandMemory(other, b);
    const initial = await a.brandAiConversation.findUniqueOrThrow({
      where: { scopeKey: old.scopeKey },
    });
    expect(await saveBrandMemory(old, learned, a)).toBe(true);
    expect(await saveBrandMemory(old, learned, b)).toBe(false);
    expect(
      (
        await a.brandAiConversation.findUniqueOrThrow({
          where: { scopeKey: old.scopeKey },
        })
      ).expiresAt,
    ).toEqual(initial.expiresAt);
    await fixture.admin.query(
      'UPDATE "BrandAiConversation" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE "scopeKey"=$1',
      [old.scopeKey],
    );
    expect(await brandMemoryCurrent(old, b)).toBe(false);
    const fresh = await loadBrandMemory(user, b);
    expect(fresh.sessionId).not.toBe(old.sessionId);
    expect(fresh.profile).toEqual(emptyBrandProfile);
    expect(await saveBrandMemory(old, learned, a)).toBe(false);
    expect(await brandMemoryCurrent(untouched, b)).toBe(true);
  },
);

it.skipIf(!enabled)(
  "concurrent initial loads share a session and only one stale revision can save",
  async () => {
    const user = actor();
    const [left, right] = await Promise.all([
      loadBrandMemory(user, a),
      loadBrandMemory(user, b),
    ]);
    expect(left.sessionId).toBe(right.sessionId);
    expect(
      (
        await Promise.all([
          saveBrandMemory(left, learned, a),
          saveBrandMemory(right, learned, b),
        ])
      ).filter(Boolean),
    ).toHaveLength(1);
    expect(await a.brandAiConversation.count()).toBe(1);
  },
);

it.skipIf(!enabled)(
  "unknown, invalid generation and LINE errors never poison stored context",
  async () => {
    const user = actor();
    const seed = await loadBrandMemory(user, a);
    await saveBrandMemory(seed, learned, a);
    const before = await a.brandAiConversation.findUniqueOrThrow({
      where: { scopeKey: seed.scopeKey },
    });
    const fake = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        usage: { input_tokens: 1000, output_tokens: 20 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  action: "handoff",
                  answer: "",
                  sourceIds: [],
                  profile: {
                    industry: null,
                    staffCount: null,
                    storeCount: null,
                    mode: null,
                    needs: [],
                    plan: null,
                  },
                }),
              },
            ],
          },
        ],
      }),
    );
    await handleBrandAiText(input(user, "幫我退款"), vi.fn(), {
      env: env(user),
      transport: fake,
      database: a,
    });
    expect(mocks.reply.mock.calls[0][1][0].text).toContain("專人");
    mocks.reply.mockResolvedValue({ success: false });
    await handleBrandAiText(input(user), vi.fn(), {
      env: env(user),
      transport: vi.fn(async () => response()),
      database: b,
    });
    expect(
      (
        await a.brandAiConversation.findUniqueOrThrow({
          where: { scopeKey: seed.scopeKey },
        })
      ).profile,
    ).toEqual(before.profile);
  },
);

it.skipIf(!enabled)(
  "expired model reply is suppressed before LINE and cannot revive a conversation",
  async () => {
    const user = actor();
    let start!: () => void, finish!: () => void;
    const started = new Promise<void>((r) => {
        start = r;
      }),
      gate = new Promise<void>((r) => {
        finish = r;
      });
    const fake = vi.fn<typeof fetch>(async () => {
      start();
      await gate;
      return response();
    });
    const pending = handleBrandAiText(input(user), vi.fn(), {
      env: env(user),
      transport: fake,
      database: a,
    });
    await started;
    await fixture.admin.query(
      'UPDATE "BrandAiConversation" SET "expiresAt"=clock_timestamp()-interval \'1 second\'',
    );
    finish();
    await pending;
    expect(mocks.reply).not.toHaveBeenCalled();
    expect((await a.brandAiConversation.findFirstOrThrow()).profile).toEqual(
      emptyBrandProfile,
    );
    expect(
      await a.brandAiReplyLog.count({
        where: { modelLeaseUntil: { not: null } },
      }),
    ).toBe(0);
  },
  30000,
);

it.skipIf(!enabled)(
  "cleanup deletes expired profiles even with AI off; public and service roles have no access",
  async () => {
    const expired = await loadBrandMemory(actor(), a),
      active = await loadBrandMemory(actor(), b);
    await fixture.admin.query(
      'UPDATE "BrandAiConversation" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE "scopeKey"=$1',
      [expired.scopeKey],
    );
    mocks.paused.mockReturnValue(true);
    expect(await purgeExpiredBrandMemory(a)).toBe(1);
    expect(
      await a.brandAiConversation.findUnique({
        where: { scopeKey: active.scopeKey },
      }),
    ).not.toBeNull();
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await fixture.admin.query(
        "SELECT has_table_privilege($1,'\"BrandAiConversation\"','SELECT,INSERT,UPDATE,DELETE') AS allowed",
        [role],
      );
      expect(rows[0].allowed).toBe(false);
    }
    expect(await saveBrandMemory(expired, learned, a)).toBe(false);
  },
);

it.skipIf(!enabled)(
  "transaction failure rolls memory back without changing other customer profiles",
  async () => {
    const m = await loadBrandMemory(actor(), a),
      other = await loadBrandMemory(actor(), b);
    await fixture.admin.query(
      `CREATE FUNCTION local_memory_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_FAULT'; END $$; CREATE TRIGGER local_memory_fault BEFORE UPDATE ON "BrandAiConversation" FOR EACH ROW EXECUTE FUNCTION local_memory_fault();`,
    );
    try {
      await expect(saveBrandMemory(m, learned, a)).rejects.toThrow();
    } finally {
      await fixture.admin.query(
        'DROP TRIGGER local_memory_fault ON "BrandAiConversation"; DROP FUNCTION local_memory_fault()',
      );
    }
    expect(
      (
        await a.brandAiConversation.findUniqueOrThrow({
          where: { scopeKey: m.scopeKey },
        })
      ).profile,
    ).toEqual(emptyBrandProfile);
    expect(await brandMemoryCurrent(other, b)).toBe(true);
  },
);
it.skipIf(!enabled)(
  "AI off and hard reply ceiling stop before context or provider access",
  async () => {
    const user = actor(),
      fake = vi.fn<typeof fetch>();
    await handleBrandAiText(input(user), vi.fn(), {
      env: { ...env(user), BRAND_AI_ENABLED: "0" },
      transport: fake,
      database: a,
    });
    await handleBrandAiText(input(user), vi.fn(), {
      env: { ...env(user), BRAND_AI_REPLY_LOG_LIMIT: "0" },
      transport: fake,
      database: a,
    });
    expect(await a.brandAiConversation.count()).toBe(0);
    expect(fake).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(brandMemoryKey(user)).not.toBe(brandMemoryKey(actor()));
  },
);

it.skipIf(!enabled)(
  "supports changing needs and a plan-specific follow-up without losing earlier facts",
  async () => {
    const user = actor(),
      fake = vi.fn<typeof fetch>(async () => response());
    await handleBrandAiText(input(user), vi.fn(), {
      env: env(user),
      transport: fake,
      database: a,
    });
    const expanding = {
      ...learned,
      storeCount: 2,
      needs: ["booking", "multi-store"],
      plan: "ALLIANCE" as const,
    };
    fake.mockImplementation(async () =>
      response(
        expanding,
        "如果要管理多店，可以評估展店版，每期NT$2980，月繳最低承諾12個月；分店系統月費另計。",
        ["plan-ALLIANCE", "branches"],
      ),
    );
    await handleBrandAiText(input(user, "之後會開第二間店呢？"), vi.fn(), {
      env: env(user),
      transport: fake,
      database: b,
    });
    await handleBrandAiText(
      input(user, "剛才推薦的那個，分店要付費嗎？"),
      vi.fn(),
      { env: env(user), transport: fake, database: a },
    );
    const third = JSON.parse(
      JSON.parse(String(fake.mock.calls[2][1]?.body)).input[0].content,
    );
    expect(third.profile).toMatchObject({
      industry: "beauty",
      staffCount: 2,
      storeCount: 2,
      plan: "ALLIANCE",
    });
    expect(mocks.reply).toHaveBeenCalledTimes(3);
    expect(
      await a.brandAiReplyLog.count({ where: { outcome: "ANSWER" } }),
    ).toBe(3);
  },
  30000,
);

it.skipIf(!enabled)(
  "pristine rollback removes only new objects; activity blocks destructive rollback",
  async () => {
    const { readFileSync } = await import("node:fs");
    const rollback = readFileSync(
      "scripts/sql/brand-line-ai/v2-rollback.proposed.sql",
      "utf8",
    );
    const probe = await brandLineLocalPostgres();
    try {
      await probe.admin.query(
        'INSERT INTO "BrandAiReplyLog"("webhookEventId") VALUES($1)',
        [randomUUID()],
      );
      await probe.admin.query(rollback);
      expect(
        (
          await probe.admin.query(
            'SELECT count(*)::int AS n FROM "BrandAiReplyLog"',
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await probe.admin.query(
            `SELECT to_regclass('public."BrandAiConversation"') IS NULL AS removed`,
          )
        ).rows[0].removed,
      ).toBe(true);
      await probe.admin.query(
        readFileSync(
          "prisma/migrations/20261128060000_brand_ai_conversation/migration.sql",
          "utf8",
        ),
      );
      await probe.admin.query(
        'UPDATE "BrandAiReplyLog" SET "knowledgeVersion"=$1',
        ["synthetic-version"],
      );
      await expect(probe.admin.query(rollback)).rejects.toThrow(
        "BRAND_V2_ACTIVITY_RETAIN_SCHEMA",
      );
      await probe.admin.query("ROLLBACK");
      expect(
        (
          await probe.admin.query(
            'SELECT "knowledgeVersion" FROM "BrandAiReplyLog"',
          )
        ).rows[0].knowledgeVersion,
      ).toBe("synthetic-version");
    } finally {
      await probe.close();
    }
  },
  30000,
);
