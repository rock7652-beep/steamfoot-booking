import { expect, it } from "vitest";
import { aiIdentity, type TrustedAiScope } from "@/server/ai/service";
import { brandIdentity, type TrustedBrandScope } from "@/server/ai/principal";
import { aiChannelSchema } from "@/server/ai/contracts";

const secret = "offline-multichannel-scope-only-".repeat(2);
const store: TrustedAiScope = { storeId: "synthetic-owner", channel: "TEST", channelAccountId: "same-account", actorId: "same-tester", module: "STEAMFOOT" };
const brand: TrustedBrandScope = { principal: { kind: "BRAND", serviceId: "synthetic-owner" }, channel: "TEST", channelAccountId: "same-account", actorId: "same-tester" };

it("current identity contracts namespace the same event across transport, account and service mode", () => {
  const identities = aiChannelSchema.options.flatMap(channel => ["same-account", "other-account"].flatMap(channelAccountId => [
    aiIdentity({ ...store, channel, channelAccountId }, "same-platform-event", secret),
    brandIdentity({ ...brand, channel, channelAccountId }, "same-platform-event", secret),
  ]));
  expect(new Set(identities.map(row => row.scopeKey)).size).toBe(12);
  expect(new Set(identities.map(row => row.eventKey)).size).toBe(12);
});
it.each(["INSTAGRAM", "WHATSAPP", "WEB_CHAT", "EMAIL"])("planned %s stays denied until its adapter and authorization contracts are implemented", channel => {
  expect(aiChannelSchema.safeParse(channel).success).toBe(false);
  expect(() => aiIdentity({ ...store, channel } as unknown as TrustedAiScope, "event", secret)).toThrow();
  expect(() => brandIdentity({ ...brand, channel } as unknown as TrustedBrandScope, "event", secret)).toThrow();
});
