import { expect, it, vi } from "vitest";
import {
  AI_CUSTOMER_SERVICE_INSTRUCTIONS,
  AI_CUSTOMER_SERVICE_UNCERTAIN_REPLY,
} from "@/server/services/ai-customer-service-framework";
import {
  selectBrandAiAnswer,
  BRAND_AI_HANDOFF,
} from "@/server/services/brand-ai-provider";
import {
  parseBrandDialogue,
  emptyBrandProfile,
} from "@/server/services/brand-ai-dialogue";
import { brandKnowledge } from "@/server/services/brand-ai-knowledge";
import { PUBLIC_STORE_CASES } from "@/lib/public-store-cases";
import { beautyStudioQualityConversation } from "./fixtures-brand-ai-customer-service";

it("shares communication rules without a brand catalog or customer context", () => {
  expect(AI_CUSTOMER_SERVICE_INSTRUCTIONS).toContain("預設約50～150字");
  expect(AI_CUSTOMER_SERVICE_INSTRUCTIONS).toContain("不為字數截掉重要條件");
  expect(AI_CUSTOMER_SERVICE_INSTRUCTIONS).toContain("一次最多一個問題");
  expect(AI_CUSTOMER_SERVICE_INSTRUCTIONS).toContain(
    "不代表其中每個細節都已告知",
  );
  expect(AI_CUSTOMER_SERVICE_INSTRUCTIONS).not.toMatch(
    /暖暖|暖沐|NT\$1480|DATABASE_URL|userId/,
  );
});

it.each(beautyStudioQualityConversation)(
  "accepts the grounded editorial reference: $question",
  async (turn) => {
    const profile = {
      ...emptyBrandProfile,
      industry: "beauty" as const,
      staffCount: 2,
      plan: "BASIC" as const,
    };
    const fake = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        usage: { input_tokens: 3000, output_tokens: 150 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  action: "answer",
                  answer: turn.answer,
                  sourceIds: turn.sourceIds,
                  profile: {
                    industry: "beauty",
                    staffCount: 2,
                    storeCount: 1,
                    mode: "appointment",
                    needs: ["booking"],
                    plan: "BASIC",
                  },
                }),
              },
            ],
          },
        ],
      }),
    );
    const result = await selectBrandAiAnswer(
      turn.question,
      { BRAND_AI_VERSION: "2", OPENAI_API_KEY: "synthetic" },
      fake,
      async () => true,
      profile,
    );
    expect(result.outcome).toBe("ANSWER");
    expect(result.text).toBe(turn.answer);
    expect(result.text.length).toBeLessThanOrEqual(150);
    expect((result.text.match(/[？?]/g) ?? []).length).toBeLessThanOrEqual(1);
    const body = JSON.parse(String(fake.mock.calls[0][1]?.body));
    expect(body.instructions).toContain(AI_CUSTOMER_SERVICE_INSTRUCTIONS);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
  },
);

it.each([
  "已為您轉接真人，請稍候。",
  "已通知專人。",
  "客服將會聯繫您。",
  "專人一定會回覆您。",
])("rejects unsupported service promises: %s", (answer) => {
  expect(() =>
    parseBrandDialogue(
      {
        action: "answer",
        answer,
        sourceIds: ["trial"],
        profile: {
          industry: null,
          staffCount: null,
          storeCount: null,
          mode: null,
          needs: [],
          plan: null,
        },
      },
      brandKnowledge("試用").sources,
      emptyBrandProfile,
    ),
  ).toThrow("UNAVAILABLE_SERVICE_PROMISE");
});

it("distinguishes publicly approved store cases from module demonstrations", () => {
  const data = brandKnowledge("美容 實體 店家 案例 範例 展示");
  const cases = data.sources.find((s) => s.id === "public-cases")!;
  expect(cases.kind).toBe("customer-case");
  for (const published of PUBLIC_STORE_CASES)
    expect(cases.text).toContain(published.intro);
  expect(cases.text).toContain("沒有美業、運動或音樂");
  expect(cases.url).toBe("https://www.steamfoot.com/cases");
  const beauty = data.sources.find((s) => s.id === "module-beauty")!;
  expect(beauty.kind).toBe("demonstration");
  expect(beauty.text).toContain("非實際店家或可操作測試帳號");
});

it("keeps V1 fallback while V2 does not promise a human transfer on errors", async () => {
  const fake = vi.fn<typeof fetch>();
  const v2 = await selectBrandAiAnswer(
    "不明問題",
    { BRAND_AI_VERSION: "2" },
    fake,
  );
  expect(v2.text).toBe(AI_CUSTOMER_SERVICE_UNCERTAIN_REPLY);
  expect(v2.text).not.toContain("將由專人");
  const v1 = await selectBrandAiAnswer("不明問題", {}, fake);
  expect(v1.text).toBe(BRAND_AI_HANDOFF);
  expect(fake).not.toHaveBeenCalled();
});
