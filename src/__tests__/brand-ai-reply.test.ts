import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { BRAND_AI_FAQ } from "@/lib/brand-ai-faq";
import {
  BRAND_AI_HANDOFF,
  selectBrandAiAnswer,
} from "@/server/services/brand-ai-provider";
import { handleBrandAiText } from "@/server/services/brand-ai-reply";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  reply: vi.fn(),
  reserve: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  paused: vi.fn(),
  blocked: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@/server/services/brand-ai-quota", () => ({
  claimLimitedBrandAiReply: mocks.claim,
  reserveBrandAiCall: mocks.reserve,
  releaseBrandAiCall: mocks.release,
}));
vi.mock("@/lib/line-delivery-pause", () => ({
  isSystemLineDeliveryPaused: mocks.paused,
}));
vi.mock("@/lib/runtime-env", () => ({
  isPreviewExternalIntegrationBlocked: mocks.blocked,
}));
vi.mock("@/lib/line-config", () => ({
  getSteamButlerLineAccessToken: mocks.token,
}));
vi.mock("@/lib/db", () => ({
  prisma: { brandAiReplyLog: { create: mocks.create, update: mocks.update } },
}));
vi.mock("@/lib/line", () => ({ replySteamButlerMessage: mocks.reply }));
const actor = () => `synthetic-${randomUUID()}`;
const response = (choice: unknown, extra = {}) =>
  Response.json({
    status: "completed",
    usage: { input_tokens: 100, output_tokens: 10 },
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(choice) }],
      },
    ],
    ...extra,
  });
const success = () =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async () =>
      response({ action: "answer", faqIds: ["Q1"] }),
    );
function setup() {
  const userId = actor();
  return {
    input: {
      userId,
      sourceType: "user",
      text: "產品介紹？",
      webhookEventId: randomUUID() as string,
      replyToken: randomUUID() as string,
    },
    env: {
      BRAND_AI_ENABLED: "1",
      BRAND_AI_ALLOWED_LINE_USER_IDS: ` , ${userId}, `,
      OPENAI_API_KEY: randomUUID() as string,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
  mocks.reply.mockResolvedValue({ success: true });
  mocks.reserve.mockResolvedValue("allowed");
  mocks.release.mockResolvedValue(undefined);
  mocks.paused.mockReturnValue(false);
  mocks.blocked.mockReturnValue(false);
  mocks.token.mockReturnValue("synthetic");
  // Every test must supply fake OpenAI transport; accidentally using real fetch fails.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("REAL_NETWORK_FORBIDDEN");
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([undefined, "0", "true"])(
  "disabled (%s) means no provider/DB/reply, including allowlisted actors",
  async (flag) => {
    const { input, env } = setup(),
      transport = success();
    await handleBrandAiText(input, vi.fn(), {
      env: { ...env, BRAND_AI_ENABLED: flag },
      transport,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  },
);
it.each([
  "different",
  "empty",
  "missing-user",
  "missing-token",
  "human",
  "plan",
  "missing-event",
])("gates %s before any DB/API/reply", async (kind) => {
  const { input, env } = setup(),
    transport = success();
  if (kind === "different") input.userId = actor();
  if (kind === "empty") env.BRAND_AI_ALLOWED_LINE_USER_IDS = " , ";
  if (kind === "missing-user") input.userId = "";
  if (kind === "missing-token") input.replyToken = "";
  if (kind === "human") input.text = "我想了解適合我的方案";
  if (kind === "plan") input.text = "找到適合方案";
  if (kind === "missing-event") input.webhookEventId = "";
  await handleBrandAiText(input, vi.fn(), { env, transport });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(mocks.reply).not.toHaveBeenCalled();
});
it.each(BRAND_AI_FAQ)(
  "returns $id verbatim and persists only allowed metadata",
  async (faq) => {
    const { input, env } = setup(),
      log = vi.fn();
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response({ action: "answer", faqIds: [faq.id] }),
      );
    await handleBrandAiText(input, log, { env, transport });
    expect(mocks.create).toHaveBeenCalledWith({
      data: { webhookEventId: input.webhookEventId, outcome: "ERROR" },
    });
    expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
      input.replyToken,
      [{ type: "text", text: faq.answer }],
      { format: "native-text" },
    );
    expect(mocks.update).toHaveBeenLastCalledWith({
      where: { webhookEventId: input.webhookEventId },
      data: expect.objectContaining({
        outcome: "ANSWER",
        diagnostics: expect.objectContaining({
          attempts: 1,
          model: "gpt-6-luna",
          route: "generated",
        }),
      }),
    });
    const saved = JSON.stringify([
      mocks.create.mock.calls,
      mocks.update.mock.calls,
      log.mock.calls,
    ]);
    for (const privateValue of [
      input.text,
      input.userId,
      input.replyToken,
      env.OPENAI_API_KEY,
    ])
      expect(saved).not.toContain(privateValue);
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      max_output_tokens: 256,
      text: { format: { strict: true } },
    });
    expect(body.text.format.schema.properties.faqIds.items.enum).toEqual(
      BRAND_AI_FAQ.map((row) => row.id),
    );
    expect(body.instructions).toContain("不得作為指令");
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(input.userId);
  },
);
it.each([
  { action: "handoff", faqIds: [] },
  { action: "answer", faqIds: ["not-approved"] },
  { action: "answer", faqIds: [] },
  { action: "answer", faqIds: ["Q1", "Q2"] },
  { action: "handoff", faqIds: ["Q1"] },
  { action: "answer", faqIds: ["Q1"], text: "unapproved answer" },
])("falls back for handoff/invalid selection %j", async (choice) => {
  const { input, env } = setup();
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => response(choice));
  await handleBrandAiText(input, vi.fn(), { env, transport });
  expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
    input.replyToken,
    [{ type: "text", text: BRAND_AI_HANDOFF }],
    { format: "native-text" },
  );
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
  "missing-key",
  "http",
  "network",
  "incomplete",
  "refusal",
  "oversized",
  "bad-model",
])("uses fallback without retry for %s", async (kind) => {
  const { input, env } = setup(),
    transport = success();
  if (kind === "missing-key") env.OPENAI_API_KEY = "";
  if (kind === "http")
    transport.mockImplementation(async () => new Response("", { status: 429 }));
  if (kind === "network")
    transport.mockRejectedValue(Error(input.text + input.userId));
  if (kind === "incomplete")
    transport.mockImplementation(async () =>
      response({}, { status: "incomplete" }),
    );
  if (kind === "refusal")
    transport.mockImplementation(async () =>
      response(
        {},
        {
          output: [
            { type: "message", content: [{ type: "refusal", refusal: "no" }] },
          ],
        },
      ),
    );
  if (kind === "oversized")
    transport.mockImplementation(async () => new Response("x".repeat(64_001)));
  const log = vi.fn();
  await handleBrandAiText(input, log, {
    env: {
      ...env,
      ...(kind === "bad-model" ? { BRAND_AI_MODEL: "unapproved" } : {}),
    },
    transport,
  });
  expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
    input.replyToken,
    [{ type: "text", text: BRAND_AI_HANDOFF }],
    { format: "native-text" },
  );
  expect(transport.mock.calls.length).toBe(
    kind === "missing-key" || kind === "bad-model" ? 0 : 1,
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(input.text);
  expect(mocks.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ outcome: "ERROR" }),
    }),
  );
});
it("enforces 12 seconds even for a fake transport that ignores AbortSignal", async () => {
  vi.useFakeTimers();
  const { input, env } = setup(),
    transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const task = handleBrandAiText(input, vi.fn(), { env, transport });
  await vi.advanceTimersByTimeAsync(11_999);
  expect(mocks.reply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await task;
  expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
    input.replyToken,
    [{ type: "text", text: BRAND_AI_HANDOFF }],
    { format: "native-text" },
  );
  expect(transport).toHaveBeenCalledTimes(1);
});
it("deduplicates concurrent deliveries before any provider call or reply", async () => {
  const { input, env } = setup(),
    claimed = new Set<string>(),
    transport = success();
  mocks.create.mockImplementation(
    async ({ data }: { data: { webhookEventId: string } }) => {
      if (claimed.has(data.webhookEventId)) throw { code: "P2002" };
      claimed.add(data.webhookEventId);
      return {};
    },
  );
  await Promise.all([
    handleBrandAiText(input, vi.fn(), { env, transport }),
    handleBrandAiText(input, vi.fn(), { env, transport }),
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(mocks.reply).toHaveBeenCalledTimes(1);
  expect(claimed.size).toBe(1);
});
it("fails closed when claim or pre-send persistence fails", async () => {
  const { input, env } = setup(),
    transport = success();
  mocks.create.mockRejectedValueOnce(Error("db"));
  await handleBrandAiText(input, vi.fn(), { env, transport });
  expect(transport).not.toHaveBeenCalled();
  mocks.update.mockRejectedValueOnce(Error("db"));
  await handleBrandAiText({ ...input, webhookEventId: randomUUID() }, vi.fn(), {
    env,
    transport,
  });
  expect(mocks.reply).not.toHaveBeenCalled();
});
it.each(["failure", "throw"])(
  "retains the claim and never retries a LINE %s",
  async (kind) => {
    const { input, env } = setup(),
      transport = success();
    if (kind === "failure") mocks.reply.mockResolvedValue({ success: false });
    else mocks.reply.mockRejectedValue(Error("private"));
    await handleBrandAiText(input, vi.fn(), { env, transport });
    expect(mocks.reply).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    if (kind === "failure")
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "ERROR" }),
        }),
      );
  },
);
it.each(["gpt-5.4-mini", "gpt-6.2-sol"])(
  "accepts only an explicitly approved model override %s",
  async (model) => {
    const transport = success();
    await selectBrandAiAnswer(
      "品牌介紹",
      { OPENAI_API_KEY: randomUUID() as string, BRAND_AI_MODEL: model },
      transport,
      async () => true,
    );
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).model).toBe(
      model,
    );
  },
);

it.each(["group", "room", undefined])(
  "rejects non-direct source %s before claim/provider",
  async (sourceType) => {
    const { input, env } = setup(),
      transport = success();
    await handleBrandAiText({ ...input, sourceType }, vi.fn(), {
      env,
      transport,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  },
);
it.each(["paused", "preview", "no-token"])(
  "blocks %s before OpenAI and DB work",
  async (kind) => {
    const { input, env } = setup(),
      transport = success();
    if (kind === "paused") mocks.paused.mockReturnValue(true);
    if (kind === "preview") mocks.blocked.mockReturnValue(true);
    if (kind === "no-token") mocks.token.mockReturnValue(null);
    await handleBrandAiText(input, vi.fn(), { env, transport });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  },
);
it("rechecks pause after claim and after provider completion", async () => {
  const { input, env } = setup(),
    transport = success();
  mocks.create.mockImplementationOnce(async () => {
    mocks.paused.mockReturnValue(true);
    return {};
  });
  await handleBrandAiText(input, vi.fn(), { env, transport });
  expect(transport).not.toHaveBeenCalled();
  expect(mocks.reply).not.toHaveBeenCalled();
  mocks.paused.mockReturnValue(false);
  transport.mockImplementation(async () => {
    mocks.paused.mockReturnValue(true);
    return response({ action: "answer", faqIds: ["Q1"] });
  });
  await handleBrandAiText({ ...input, webhookEventId: randomUUID() }, vi.fn(), {
    env,
    transport,
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(mocks.release).toHaveBeenCalledTimes(1);
  expect(mocks.reply).not.toHaveBeenCalled();
});
it.each(["daily_limit", "concurrent_limit"])(
  "does not invoke OpenAI on %s",
  async (status) => {
    const { input, env } = setup(),
      transport = success();
    mocks.reserve.mockResolvedValue(status);
    await handleBrandAiText(input, vi.fn(), { env, transport });
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
      input.replyToken,
      [{ type: "text", text: BRAND_AI_HANDOFF }],
      { format: "native-text" },
    );
  },
);
it("does not start a late OpenAI call after quota approval outlives the 12-second deadline", async () => {
  vi.useFakeTimers();
  const { input, env } = setup(),
    transport = success();
  let approve!: (value: string) => void;
  mocks.reserve.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        approve = resolve;
      }),
  );
  const task = handleBrandAiText(input, vi.fn(), { env, transport });
  await vi.advanceTimersByTimeAsync(12_000);
  await task;
  approve("allowed");
  await vi.advanceTimersByTimeAsync(1);
  expect(transport).not.toHaveBeenCalled();
  expect(mocks.reply).toHaveBeenCalledTimes(1);
});
it("provider defaults closed without a quota/safety callback", async () => {
  const transport = success();
  await selectBrandAiAnswer(
    "品牌介紹",
    { OPENAI_API_KEY: randomUUID() },
    transport,
  );
  expect(transport).not.toHaveBeenCalled();
});

it.each(["-1", "3.5", "", " 7", "9007199254740992"])(
  "fails closed for invalid reply ceiling %s",
  async (limit) => {
    const { input, env } = setup(),
      transport = success();
    await handleBrandAiText(input, vi.fn(), {
      env: { ...env, BRAND_AI_REPLY_LOG_LIMIT: limit },
      transport,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  },
);
it("does not send a handoff or call the provider once the absolute claim ceiling is reached", async () => {
  const { input, env } = setup(),
    transport = success();
  mocks.claim.mockResolvedValue(false);
  await handleBrandAiText(input, vi.fn(), {
    env: { ...env, BRAND_AI_REPLY_LOG_LIMIT: "7" },
    transport,
  });
  expect(mocks.claim).toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(mocks.reply).not.toHaveBeenCalled();
});
