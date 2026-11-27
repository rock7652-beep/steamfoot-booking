import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiIdentity, AiButlerService, type TrustedAiScope } from "@/server/ai/service";
import { aiModuleSchema, type AiKnowledge } from "@/server/ai/contracts";
import { readAiLineEnvelope, verifyAiLineEvents } from "@/server/ai/line-webhook";
import { selectAiKnowledge, renderAiAnswer } from "@/server/ai/knowledge";
import { aiResponseBody } from "@/server/ai/provider";
import { AiToolRegistry } from "@/server/ai/tools";
import { PUBLIC_PRICING_PLANS } from "@/lib/public-pricing-offer";
vi.mock("@/lib/line-config", () => ({}));
const now = new Date("2026-11-26T09:30:00Z"), key = "offline-dual-context-identity-only-".repeat(2);
const actor = `U${"a".repeat(32)}`, regular = `U${"b".repeat(32)}`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const bindings = [
  { mode: "BRAND_SUPPORT", owner: "brand:steamfoot", destination: `U${"1".repeat(32)}`, secret: "offline-brand-secret", testers: [hash(actor)] },
  { mode: "STORE_MANAGER", owner: "store:warm-fixture", destination: `U${"2".repeat(32)}`, secret: "offline-warm-secret", testers: [hash(actor)] },
] as const;
/** Test-only shadow classification. Never calls a model, repository, original handler or sender.
 * It is NOT installed on the existing OAs and cannot transfer reply ownership. */
function shadow(body: string, signature: string, enabled: readonly boolean[], stopped: boolean) {
  const envelope = readAiLineEnvelope(body), binding = bindings.find(b => b.destination === envelope.destination);
  if (!binding) throw Error("UNKNOWN_OA");
  const events = verifyAiLineEvents(body, signature, { storeId: "envelope-validation-only-not-a-store-scope", ...binding }, now);
  return events.map(event => {
    const listed = binding.testers.some(id => id === hash(event.source.userId));
    return { originalMustRemainOwner: true, canSend: false, modelCalls: 0,
      candidate: listed && enabled[bindings.indexOf(binding)] && !stopped ? { mode: binding.mode, namespace: binding.owner, actorHash: hash(event.source.userId) } : null };
  });
}
function signed(index: 0 | 1, sender = actor, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ destination: bindings[index].destination, events: [{ type: "message", mode: "active", webhookEventId: "same-event", timestamp: now.getTime(), source: { type: "user", userId: sender }, message: { type: "text", id: "same-message", text: "價格？" }, ...extra }] });
  return { body, signature: createHmac("sha256", bindings[index].secret).update(body).digest("base64") };
}
const scope: TrustedAiScope = { storeId: "warm-fixture", channel: "TEST", channelAccountId: bindings[1].destination, actorId: actor, module: "STEAMFOOT" };
const publicBrand: AiKnowledge = { id: "brand-public-price-v1", version: 1, scope: "SYSTEM", storeId: null, module: null, status: "PUBLISHED", question: "產品價格？", answer: `公開產品方案：${PUBLIC_PRICING_PLANS.map(p => `${p.name} NT$${p.monthly}/月`).join("、")}`, updatedAt: now.toISOString(), expiresAt: "2026-11-27T00:00:00Z" };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK_FORBIDDEN"); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
it.each([0, 1] as const)("ordinary users in OA %i keep original reply ownership in the shadow proposal", index => {
  const r = signed(index, regular); expect(shadow(r.body, r.signature, [true, true], false)).toEqual([{ originalMustRemainOwner: true, canSend: false, modelCalls: 0, candidate: null }]);
});
it("the same allowlisted tester in two OAs maps to two service owners", () => {
  const candidates = ([0, 1] as const).map(i => { const r = signed(i); return shadow(r.body, r.signature, [true, true], false)[0]; });
  expect(candidates[0].candidate).toMatchObject({ mode: "BRAND_SUPPORT", namespace: "brand:steamfoot" });
  expect(candidates[1].candidate).toMatchObject({ mode: "STORE_MANAGER", namespace: "store:warm-fixture" });
  expect(candidates.every(c => !c.canSend && c.originalMustRemainOwner)).toBe(true);
});
it.each([0, 1] as const)("disabling mode %i does not suppress the other candidate", disabled => {
  const flags = [true, true]; flags[disabled] = false;
  for (const i of [0, 1] as const) { const r = signed(i); expect(Boolean(shadow(r.body, r.signature, flags, false)[0].candidate)).toBe(i !== disabled); }
});
it("global stop leaves all original paths untouched", () => { for (const i of [0, 1] as const) { const r = signed(i); expect(shadow(r.body, r.signature, [true, true], true)[0]).toMatchObject({ originalMustRemainOwner: true, canSend: false, candidate: null }); } });
it("a body-supplied mode/store never selects the service owner", () => {
  const r = signed(0, actor, { serviceMode: "STORE_MANAGER", storeId: "foreign", customerId: "forged" });
  expect(shadow(r.body, r.signature, [true, true], false)[0].candidate?.namespace).toBe("brand:steamfoot");
});
it("another OA's valid signature cannot admit a tester", () => { const a = signed(0), b = signed(1); expect(() => shadow(a.body, b.signature, [true, true], false)).toThrow(); });
it("whitelisting alone does not create a sender or switch actual reply ownership", () => { const r = signed(0); expect(shadow(r.body, r.signature, [true, true], false)[0]).toMatchObject({ canSend: false, modelCalls: 0, originalMustRemainOwner: true }); });
it("the legacy Store identity deliberately cannot represent store-independent brand support", () => {
  expect(() => aiIdentity({ ...scope, storeId: "" }, "event", key)).toThrow("SCOPE");
  expect(() => aiModuleSchema.parse("BRAND_SUPPORT")).toThrow();
});
it("legacy storeless brand attempts stop before repository or provider access", async () => {
  const setting = vi.fn(), respond = vi.fn();
  const service = new AiButlerService({ setting } as unknown as ConstructorParameters<typeof AiButlerService>[0], { kind: "mock", respond }, async () => undefined, key, () => null, () => true, () => now);
  expect(await service.respond({ ...scope, storeId: "" }, "event", "產品介紹？", [publicBrand])).toMatchObject({ outcome: "STOPPED" });
  expect(setting).not.toHaveBeenCalled(); expect(respond).not.toHaveBeenCalled();
});
it("the existing provider request builder and approved-answer renderer can reuse public product knowledge", () => {
  const request = aiResponseBody({ model: "gpt-6-luna", message: "產品價格？", knowledge: [publicBrand], summary: [] });
  expect(request.model).toBe("gpt-6-luna"); expect(request.store).toBe(false);
  expect(renderAiAnswer({ action: "answer", sourceIds: [publicBrand.id] }, [publicBrand])).toEqual({ text: publicBrand.answer, handoff: false });
  expect(renderAiAnswer({ action: "answer", sourceIds: ["private-store-source"] }, [publicBrand]).handoff).toBe(true);
});
it("SYSTEM remains global; this historical example must not be used as a Brand projection", () => {
  for (const store of ["warm-fixture", "other-fixture"]) expect(selectAiKnowledge(store, "STEAMFOOT", [publicBrand], now)).toHaveLength(1);
});
it("a different OA already separates conversations, but switching modules does not create separate owner grants", () => {
  const warm = aiIdentity(scope, "same-event", key);
  expect(aiIdentity({ ...scope, channelAccountId: bindings[0].destination }, "same-event", key).scopeKey).not.toBe(warm.scopeKey);
  expect(aiIdentity({ ...scope, module: "BEAUTY" }, "same-event", key).scopeKey).toBe(warm.scopeKey);
});
it("knowledge mode cannot invoke an operational tool even if one is registered", async () => {
  const authorize = vi.fn(), execute = vi.fn(); const registry = new AiToolRegistry();
  const { z } = await import("zod"); registry.register({ name: "availability", module: "STEAMFOOT", mode: "READ", parameters: z.object({}).strict(), authorize, execute });
  await expect(registry.invoke(scope, { name: "availability", arguments: {} }, "KNOWLEDGE")).rejects.toThrow("DISABLED");
  expect(authorize).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
