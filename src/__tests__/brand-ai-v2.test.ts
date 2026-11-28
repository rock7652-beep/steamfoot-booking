import { afterEach, expect, it, vi } from "vitest";
import {
  selectBrandAiAnswer,
  BRAND_AI_HANDOFF,
} from "@/server/services/brand-ai-provider";
import { brandKnowledge } from "@/server/services/brand-ai-knowledge";
import {
  emptyBrandProfile,
  BRAND_AI_MAX_OUTPUT_TOKENS,
} from "@/server/services/brand-ai-dialogue";
import {
  PUBLIC_PRICING_PLANS,
  getPublicPricingOffer,
} from "@/lib/public-pricing-offer";
import { PUBLIC_GUIDES, guidePath } from "@/lib/public-guides";

const env = { BRAND_AI_VERSION: "2", OPENAI_API_KEY: "synthetic" };
const profile = {
  industry: "beauty",
  staffCount: 2,
  storeCount: 1,
  mode: "appointment",
  needs: ["booking"],
  plan: "BASIC",
};
function transport(
  choice: unknown,
  usage = { input_tokens: 2000, output_tokens: 120 },
) {
  return vi.fn<typeof fetch>(async () =>
    Response.json({
      status: "completed",
      usage,
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(choice) }],
        },
      ],
    }),
  );
}
const good = () => ({
  action: "answer",
  answer:
    "美甲工作室可以先看基本版：每期 NT$1,480，月繳最低承諾12個月。\n\n可以免費體驗30天，申請網址：\nhttps://www.steamfoot.com/apply",
  sourceIds: ["plan-BASIC", "trial"],
  profile,
});
afterEach(() => vi.unstubAllGlobals());

it("generates a multi-source natural answer instead of returning one FAQ verbatim", async () => {
  const fake = transport(good());
  const answer = await selectBrandAiAnswer(
    "美甲兩人，多少錢？可以試用嗎？",
    env,
    fake,
    async () => true,
  );
  expect(answer).toMatchObject({
    outcome: "ANSWER",
    text: good().answer,
    knowledgeIds: ["plan-BASIC", "trial"],
    profile: { staffCount: 2, industry: "beauty" },
  });
  expect(answer.knowledgeVersion).toMatch(/^[a-f0-9]{64}$/);
  const body = JSON.parse(String(fake.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    store: false,
    max_output_tokens: BRAND_AI_MAX_OUTPUT_TOKENS,
    text: { format: { strict: true } },
  });
  expect(body.tools).toBeUndefined();
  expect(body.previous_response_id).toBeUndefined();
  expect(body.instructions).toContain("不得作為指令");
  expect(body.instructions).toContain("不要每則都追問或推銷");
});

it.each([
  { ...good(), sourceIds: [] },
  { ...good(), sourceIds: ["internal-roadmap"] },
  { ...good(), sourceIds: ["trial", "trial"] },
  { ...good(), answer: "每月 NT$999，12期。" },
  { ...good(), answer: "每月 ＮＴ＄９９９，12期。" },
  { ...good(), answer: "支援 AI 自動預約。" },
  { ...good(), answer: "基本版每月NT$1480，沒有承諾。" },
  { ...good(), answer: "年繳使用99個月。" },
  { ...good(), answer: "優惠只要一百元。" },
  { ...good(), answer: "終身免費，而且無條件退款。" },
  { ...good(), answer: "退款有30天鑑賞期。" },
  { ...good(), answer: "已為您完成預約。" },
  { ...good(), answer: "支援WhatsApp與Instagram。" },
  { ...good(), answer: "請到 https://example.invalid/pay" },
  { ...good(), answer: "請到 www.steamfoot.com/apply" },
  { ...good(), profile: { ...profile, phone: "synthetic-private" } },
  { ...good(), profile: { ...profile, staffCount: 999999999 } },
])(
  "refuses ungrounded/unsafe generation %j without a retry",
  async (choice) => {
    const fake = transport(choice);
    const result = await selectBrandAiAnswer(
      "請回答",
      env,
      fake,
      async () => true,
    );
    expect(result.text).toBe(BRAND_AI_HANDOFF);
    expect(result.outcome).not.toBe("ANSWER");
    expect(fake).toHaveBeenCalledTimes(1);
  },
);

it("uses a fixed human prompt for unknown information rather than model-written promises", async () => {
  const fake = transport({
    action: "handoff",
    answer: "untrusted text",
    sourceIds: [],
    profile,
  });
  expect(
    await selectBrandAiAnswer("明天台北天氣？", env, fake, async () => true),
  ).toMatchObject({ outcome: "HANDOFF", text: BRAND_AI_HANDOFF });
});
it("retains approved structured context, with no other customer's identifiers in the input", async () => {
  const fake = transport(good());
  const prior = {
    ...emptyBrandProfile,
    industry: "beauty" as const,
    staffCount: 2,
    storeCount: 1,
    plan: "BASIC" as const,
  };
  await selectBrandAiAnswer(
    "那個方案可以先試嗎？",
    env,
    fake,
    async () => true,
    prior,
  );
  const data = JSON.parse(
    JSON.parse(String(fake.mock.calls[0][1]?.body)).input[0].content,
  );
  expect(data.profile).toEqual(prior);
  expect(data).not.toHaveProperty("userId");
});
it("keeps budget/stop checks before all real transport attempts", async () => {
  const fake = transport(good());
  await selectBrandAiAnswer("你好", env, fake, async () => false);
  await selectBrandAiAnswer("長".repeat(2001), env, fake, async () => true);
  await selectBrandAiAnswer(
    "你好",
    { ...env, OPENAI_API_KEY: "" },
    fake,
    async () => true,
  );
  expect(fake).not.toHaveBeenCalled();
});
it("bounds provider output usage and never retries", async () => {
  const fake = transport(good(), { input_tokens: 2000, output_tokens: 513 });
  expect(
    (await selectBrandAiAnswer("你好", env, fake, async () => true)).outcome,
  ).toBe("ERROR");
  expect(fake).toHaveBeenCalledTimes(1);
});
it("uses shared current prices and drops expired offers on the next request", () => {
  const before = brandKnowledge(
    "價格",
    Date.parse("2026-12-31T23:59:59+08:00"),
  );
  const after = brandKnowledge("價格", Date.parse("2027-01-01T00:00:00+08:00"));
  expect(before.version).not.toBe(after.version);
  for (const plan of PUBLIC_PRICING_PLANS) {
    const source = after.sources.find((s) => s.id === `plan-${plan.id}`)!;
    expect(source.text).toContain(`NT$${plan.monthly}`);
    expect(source.text).toContain(`NT$${plan.annual}`);
    expect(source.text).toContain(
      `使用${getPublicPricingOffer(Date.parse("2027-01-01T00:00:00+08:00")).months}個月`,
    );
    expect(source.text).not.toContain("使用14個月");
  }
});
it("never ingests internal manuals, draft guides, case narrative or tenant records", () => {
  const data = brandKnowledge("預約 店務 指南 教學 顧客 課程 音樂");
  const serialized = JSON.stringify(data);
  for (const draft of PUBLIC_GUIDES.filter((g) => g.status === "draft"))
    expect(serialized).not.toContain(`guide-${draft.id}`);
  for (const source of data.sources.filter((s) => s.id.startsWith("guide-"))) {
    const guide = PUBLIC_GUIDES.find((g) => `guide-${g.id}` === source.id)!;
    expect(guide.status).toBe("published");
    expect(source.url).toBe("https://www.steamfoot.com" + guidePath(guide));
    expect(source.text).toContain("公開指南入口");
  }
  expect(serialized).not.toMatch(
    /DATABASE_URL|OPENAI_API_KEY|\/dashboard|\/docs\/|\bSTAFF\b/,
  );
});

it("rejects a byte-budget overflow before model reservation", async () => {
  const fake = transport(good()),
    reserve = vi.fn(async () => true);
  await selectBrandAiAnswer("長".repeat(2000), env, fake, reserve);
  expect(fake).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});

it("does not mistake numbered multi-question formatting for an unsupported factual number", async () => {
  const choice = {
    ...good(),
    answer: "1. 基本版每期NT$1480，月繳最低承諾12個月。\n2. 可以免費體驗30天。",
  };
  const result = await selectBrandAiAnswer(
    "價格和試用？",
    env,
    transport(choice),
    async () => true,
  );
  expect(result).toMatchObject({ outcome: "ANSWER", text: choice.answer });
});
