import { describe, expect, it } from "vitest";
import { lineWebhookEventKey } from "@/server/services/line-rebind";

describe("LINE rebind event idempotency key", () => {
  it("uses LINE webhookEventId as the normal idempotency key", () => {
    expect(lineWebhookEventKey({ webhookEventId: "01H810YECXQQZ37VAXPF6H9E6T" }))
      .toBe("line:01H810YECXQQZ37VAXPF6H9E6T");
  });

  it("uses a stable fallback only when all source fields are present", () => {
    const input = { destination: "Ubot", sourceUserId: "Uuser", timestamp: 1, messageId: "123" };
    expect(lineWebhookEventKey(input)).toBe(lineWebhookEventKey(input));
    expect(lineWebhookEventKey({ ...input, messageId: undefined })).toBeNull();
    expect(lineWebhookEventKey({ ...input, timestamp: undefined })).toBeNull();
  });
});
