import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMessengerUtilityTemplateConfig,
  messengerUtilityRemindersEnabled,
} from "@/lib/messenger-config";
import { sendMessengerUtilityTemplate } from "@/lib/messenger";

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  vi.unstubAllGlobals();
});

describe("Messenger Utility reminder configuration", () => {
  it("is disabled by default and requires a complete, exact template order", () => {
    delete process.env.MESSENGER_UTILITY_REMINDERS_ENABLED;
    delete process.env.MESSENGER_UTILITY_TEMPLATE_NAME;
    delete process.env.MESSENGER_UTILITY_TEMPLATE_LANGUAGE;
    delete process.env.MESSENGER_UTILITY_TEMPLATE_PARAMETER_ORDER;
    expect(messengerUtilityRemindersEnabled()).toBe(false);
    expect(getMessengerUtilityTemplateConfig("store-a")).toBeNull();

    process.env.MESSENGER_UTILITY_TEMPLATE_NAME = "appointment_reminder";
    process.env.MESSENGER_UTILITY_TEMPLATE_LANGUAGE = "zh_TW";
    process.env.MESSENGER_UTILITY_TEMPLATE_PARAMETER_ORDER = "shopName,bookingDate,bookingTime,people,bookingLink";
    expect(getMessengerUtilityTemplateConfig("store-a")).toEqual({
      name: "appointment_reminder", language: "zh_TW",
      parameterOrder: ["shopName", "bookingDate", "bookingTime", "people", "bookingLink"],
    });
    process.env.MESSENGER_UTILITY_TEMPLATE_PARAMETER_ORDER = "shopName,bookingDate";
    expect(getMessengerUtilityTemplateConfig("store-a")).toBeNull();
  });

  it("uses Meta UTILITY template payload rather than RESPONSE", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMessengerUtilityTemplate({
      pageId: "page-id", pageAccessToken: "secret", recipientId: "psid-secret",
      template: { name: "appointment_reminder", language: "zh_TW", parameters: ["店", "2026-08-11", "14:00", "2", "https://example.test/manage"] },
    });
    expect(result).toEqual({ success: true });
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      recipient: { id: "psid-secret" }, messaging_type: "UTILITY",
      template: {
        name: "appointment_reminder", language: { code: "zh_TW" },
        components: [{ type: "body", parameters: ["店", "2026-08-11", "14:00", "2", "https://example.test/manage"].map(text => ({ type: "text", text })) }],
      },
    });
  });

  it("classifies Meta rejection and transport failure without returning response content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"recipient":"sensitive"}', { status: 400 })));
    await expect(sendMessengerUtilityTemplate({ pageId: "p", pageAccessToken: "t", recipientId: "id", template: { name: "n", language: "zh_TW", parameters: [] } }))
      .resolves.toEqual({ success: false, failureCode: "FAILED_META_REJECTED" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    await expect(sendMessengerUtilityTemplate({ pageId: "p", pageAccessToken: "t", recipientId: "id", template: { name: "n", language: "zh_TW", parameters: [] } }))
      .resolves.toEqual({ success: false, failureCode: "FAILED_TRANSPORT" });
  });
});
