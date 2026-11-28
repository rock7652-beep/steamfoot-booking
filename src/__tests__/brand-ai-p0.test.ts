import { afterEach, expect, it, vi } from "vitest";
import { selectBrandAiAnswer } from "@/server/services/brand-ai-provider";
const env = { BRAND_AI_VERSION: "2", OPENAI_API_KEY: "synthetic" };
const profile = {
  industry: "beauty",
  staffCount: 2,
  storeCount: 1,
  mode: "appointment",
  needs: ["booking"],
  plan: "BASIC",
};
const answer = (
  text = "可以先到 https://www.steamfoot.com/apply 申請免費體驗。",
  ids = ["trial-application"],
) => ({ action: "answer", answer: text, sourceIds: ids, profile });
const response = (value: unknown, input = 3000, output = 120) =>
  Response.json({
    status: "completed",
    usage: { input_tokens: input, output_tokens: output },
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
afterEach(() => vi.useRealTimers());
it("corrects a validation failure once, records safe diagnostics and sums both usages", async () => {
  const fake = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      response(answer("每月NT$999，12期。", ["plan-BASIC"])),
    )
    .mockResolvedValueOnce(response(answer()));
  const allow = vi.fn(async () => true);
  const result = await selectBrandAiAnswer("怎麼申請試用", env, fake, allow);
  expect(result).toMatchObject({
    outcome: "ANSWER",
    inputTokens: 6000,
    outputTokens: 240,
    diagnostics: {
      attempts: 2,
      route: "repaired",
      failures: [
        {
          code: "UNAPPROVED_PRICE",
          stage: "validation",
          sourceIds: ["plan-BASIC"],
        },
      ],
    },
  });
  expect(allow.mock.calls).toEqual([[1], [2]]);
  const second = JSON.parse(String(fake.mock.calls[1][1]?.body));
  expect(second.max_output_tokens).toBe(392);
  expect(JSON.parse(second.input[0].content).repair.code).toBe(
    "UNAPPROVED_PRICE",
  );
  expect(JSON.stringify(result.diagnostics)).not.toContain("999");
});
it("uses exact approved trial knowledge after two invalid outputs, no third call or invalid profile", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer("虛構回答", ["private-user-text"])),
  );
  const result = await selectBrandAiAnswer(
    "如何申請試用",
    env,
    fake,
    async () => true,
  );
  expect(fake).toHaveBeenCalledTimes(2);
  expect(result.diagnostics?.route).toBe("knowledge_fallback");
  expect(result.knowledgeIds).toEqual(["trial-application"]);
  expect(result.text).toContain("https://www.steamfoot.com/apply");
  expect(result.profile).toBeUndefined();
  expect(JSON.stringify(result.diagnostics)).not.toContain("private-user-text");
});
it("denied correction consumes no second transport call but keeps useful approved fallback", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer("NT$999", ["plan-BASIC"])),
  );
  const allow = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const result = await selectBrandAiAnswer("怎麼試用", env, fake, allow);
  expect(fake).toHaveBeenCalledTimes(1);
  expect(result.diagnostics).toMatchObject({
    attempts: 1,
    route: "knowledge_fallback",
  });
  expect(result.diagnostics?.failures.at(-1)?.code).toBe("CALL_NOT_AUTHORIZED");
});
it.each([
  ["你原本用LINE聊天，感覺像Messenger。", ["brand"]],
  ["我想問3個預約功能問題。", ["module-beauty"]],
  ["目前不支援WhatsApp，也沒有AI自動預約。", ["module-beauty"]],
  ["送出申請後，專人會聯繫確認設定。", ["trial-application"]],
  ["申請入口：https://www.steamfoot.com/apply。", ["trial-application"]],
])("allows natural wording without weakening facts: %s", async (text, ids) => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer(text as string, ids as string[])),
  );
  const result = await selectBrandAiAnswer(
    "美容工作室有問題想了解",
    env,
    fake,
    async () => true,
  );
  expect(result.outcome).toBe("ANSWER");
  expect(fake).toHaveBeenCalledTimes(1);
});
it.each([
  "沒有WhatsApp，但是支援Instagram。",
  "不提供退款但保證收益。",
  "已為您退款。",
  "已通知專人。",
  "基本版每月NT$999，12期。",
  "基本版每月NT$2480，12期。",
  "優惠至2027/12/31。",
  "請到http://unsafe.invalid",
  "您的電話是0912345678。",
])("does not publish high-risk output: %s", async (text) => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer(text, ["plan-BASIC"])),
  );
  const result = await selectBrandAiAnswer(
    "請確認",
    env,
    fake,
    async () => true,
  );
  expect(result.outcome).not.toBe("ANSWER");
  expect(result.text).not.toContain(text);
});
it("does not retry HTTP errors or leak an error payload; unknown usage stays unknown", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    Response.json({ private: "do-not-log" }, { status: 429 }),
  );
  const result = await selectBrandAiAnswer(
    "未知的問題",
    env,
    fake,
    async () => true,
  );
  expect(fake).toHaveBeenCalledTimes(1);
  expect(result.inputTokens).toBeNull();
  expect(result.diagnostics?.failures[0]).toMatchObject({
    code: "HTTP_429",
    stage: "transport",
  });
  expect(JSON.stringify(result)).not.toContain("do-not-log");
});
it("shares one12s deadline between both attempts instead of restarting a timer", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const fake = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        const n = ++calls;
        setTimeout(
          () =>
            resolve(
              response(n === 1 ? answer("NT$999", ["plan-BASIC"]) : answer()),
            ),
          n === 1 ? 8000 : 6000,
        );
      }),
  );
  const pending = selectBrandAiAnswer("怎麼試用", env, fake, async () => true);
  await vi.advanceTimersByTimeAsync(12000);
  const result = await pending;
  expect(fake).toHaveBeenCalledTimes(2);
  expect(result.diagnostics?.failures.at(-1)?.code).toBe("DEADLINE");
  expect(result.inputTokens).toBeNull();
  expect(result.diagnostics?.route).toBe("knowledge_fallback");
});
it("does not repair when the first output has exhausted the512token total budget", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer("NT$999", ["plan-BASIC"]), 3000, 512),
  );
  const result = await selectBrandAiAnswer(
    "怎麼試用",
    env,
    fake,
    async () => true,
  );
  expect(fake).toHaveBeenCalledTimes(1);
  expect(result.diagnostics?.failures.at(-1)?.code).toBe(
    "REQUEST_BUDGET_EXHAUSTED",
  );
});

it("binds a named plan price even when the wrong price appears in another cited plan", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(
      answer("基本版每月NT$2480，12期。", ["plan-BASIC", "plan-GROWTH"]),
    ),
  );
  const result = await selectBrandAiAnswer(
    "請核對",
    env,
    fake,
    async () => true,
  );
  expect(result.outcome).toBe("ERROR");
  expect(result.diagnostics?.failures[0].code).toBe("PLAN_PRICE_MISMATCH");
});

it("does not spend another call when the remaining input budget is insufficient", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    response(answer("NT$999", ["plan-BASIC"]), 15000, 100),
  );
  const result = await selectBrandAiAnswer(
    "怎麼試用",
    env,
    fake,
    async () => true,
  );
  expect(fake).toHaveBeenCalledTimes(1);
  expect(result.diagnostics?.failures.at(-1)?.code).toBe(
    "REQUEST_BUDGET_EXHAUSTED",
  );
});
it("validates the correction with the same URL and price checks", async () => {
  const fake = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(answer("NT$999", ["plan-BASIC"])))
    .mockResolvedValueOnce(
      response(answer("請到https://evil.invalid付款", ["plan-BASIC"])),
    );
  const result = await selectBrandAiAnswer(
    "請核對",
    env,
    fake,
    async () => true,
  );
  expect(result.outcome).toBe("ERROR");
  expect(result.diagnostics?.failures.map((d) => d.code)).toEqual([
    "UNAPPROVED_PRICE",
    "UNAPPROVED_URL",
  ]);
});
