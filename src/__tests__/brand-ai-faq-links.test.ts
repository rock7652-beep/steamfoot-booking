import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BRAND_AI_FAQ } from "@/lib/brand-ai-faq";
import { BRAND_AI_HANDOFF } from "@/server/services/brand-ai-provider";
import { replySteamButlerMessage } from "@/lib/line";

const send = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("LINE_DELIVERY_RESUME_AT", "2026-10-30T14:00:00.000Z");
  vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "synthetic-token");
  send.mockReset().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", send);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([...BRAND_AI_FAQ.map((faq) => faq.answer), BRAND_AI_HANDOFF])(
  "sends approved FAQ / handoff as one native text message: %s",
  async (text) => {
    expect(
      await replySteamButlerMessage(
        "synthetic-reply",
        [{ type: "text", text }],
        {
          format: "native-text",
        },
      ),
    ).toEqual({ success: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(
      "https://api.line.me/v2/bot/message/reply",
    );
    const body = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(body).toEqual({
      replyToken: "synthetic-reply",
      messages: [{ type: "text", text }],
    });
  },
);

it.each([
  ["Q3", "https://www.steamfoot.com/apply"],
  ["Q6", "https://www.steamfoot.com/pricing"],
])(
  "keeps %s HTTPS URL on its own line with the remaining answer",
  (id, uri) => {
    const faq = BRAND_AI_FAQ.find((entry) => entry.id === id)!;
    expect(faq.answer.split("\n")).toContain(uri);
    expect(faq.answer).toContain("\n\n");
    expect(faq.answer).not.toMatch(/(?<!https:\/\/)www\./);
  },
);

it("preserves existing Flex cards and default text conversion", async () => {
  const card = {
    type: "flex" as const,
    altText: "方案",
    contents: { type: "bubble" },
  };
  await replySteamButlerMessage("synthetic-reply", [
    card,
    { type: "text", text: "既有通知" },
  ]);
  const body = JSON.parse(String(send.mock.calls[0][1]?.body));
  expect(body.messages[0]).toEqual(card);
  expect(body.messages[1]).toMatchObject({ type: "flex", altText: "既有通知" });
});

it.each(["paused", "preview", "missing-token"])(
  "native text retains delivery protection: %s",
  async (reason) => {
    if (reason === "paused") vi.stubEnv("LINE_DELIVERY_RESUME_AT", "");
    if (reason === "preview") vi.stubEnv("VERCEL_ENV", "preview");
    if (reason === "missing-token")
      vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "");
    const result = await replySteamButlerMessage(
      "synthetic-reply",
      [{ type: "text", text: BRAND_AI_HANDOFF }],
      {
        format: "native-text",
      },
    );
    expect(result).toMatchObject({ success: false });
    expect(send).not.toHaveBeenCalled();
  },
);
