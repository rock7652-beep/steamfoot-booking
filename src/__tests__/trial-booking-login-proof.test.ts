import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ store: { findUnique: vi.fn() }, trialBookingLink: { create: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://isolated.test" }));
import { createTrialBookingChatLink, resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
const subject = "U" + "a".repeat(32);
const now = new Date("2026-10-26T06:00:00Z");
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DIGITAL_BUTLER_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64url"));
  db.store.findUnique.mockResolvedValue({ slug: "zhubei", industryModule: "STEAMFOOT" });
  db.trialBookingLink.create.mockImplementation(({ data }) => {
    stored = { ...data, id: "entry", consumedAt: null };
    return { id: "entry", expiresAt: data.expiresAt };
  });
  db.trialBookingLink.findUnique.mockImplementation(() => stored);
});
afterEach(() => vi.unstubAllEnvs());
async function issue(notificationVerified = false) {
  const link = await createTrialBookingChatLink({ storeId: "store", channel: "LINE", chatIdentity: subject,
    verifiedLogin: { channelId: "2010761154", lineUserId: subject }, notificationVerified, now });
  return new URL(link.url).searchParams.get("entry")!;
}
describe("encrypted public trial Login proof", () => {
  it.each([true, false])("round-trips Login proof separately from notification eligibility: %s", async notificationVerified => {
    const entry = await issue(notificationVerified);
    expect(await resolveTrialBookingChatLink(entry, now)).toEqual({ linkId: "entry", storeId: "store", channel: "LINE",
      chatIdentity: subject, verifiedLogin: { channelId: "2010761154", lineUserId: subject }, notificationVerified });
    expect(JSON.stringify(stored)).not.toContain(subject);
    expect(JSON.stringify(stored)).not.toContain(entry.split(".")[1]);
  });
  it("retains legacy store-webhook entries without inferring Login proof", async () => {
    const link = await createTrialBookingChatLink({ storeId: "store", channel: "LINE", chatIdentity: subject, now });
    expect(await resolveTrialBookingChatLink(new URL(link.url).searchParams.get("entry")!, now)).toEqual({ linkId: "entry", storeId: "store", channel: "LINE", chatIdentity: subject });
  });
  it.each(["wrong_secret", "expired", "consumed", "tampered"])("never accepts %s entry evidence", async problem => {
    let entry = await issue();
    if (problem === "wrong_secret") entry = "entry.wrong";
    if (problem === "expired") stored.expiresAt = now;
    if (problem === "consumed") stored.consumedAt = now;
    if (problem === "tampered") (stored.identityCiphertext as Uint8Array)[0] ^= 1;
    expect(await resolveTrialBookingChatLink(entry, now)).toBeNull();
  });
  it("cannot redeem a Login capability after stripping its version for an old deployment", async () => {
    const entry = await issue();
    expect(entry.endsWith(".login1")).toBe(true);
    expect(await resolveTrialBookingChatLink(entry.replace(/\.login1$/, ""), now)).toBeNull();
  });
  it("does not expose Login proof to another module after the store changes", async () => {
    const entry = await issue();
    db.store.findUnique.mockResolvedValue({ slug: "zhubei", industryModule: "BEAUTY" });
    expect(await resolveTrialBookingChatLink(entry, now)).toBeNull();
  });
  it.each(["MESSENGER", "BEAUTY", "mismatched_subject"])("does not issue Login proof for %s", async problem => {
    if (problem === "BEAUTY") db.store.findUnique.mockResolvedValue({ slug: "beauty", industryModule: "BEAUTY" });
    await expect(createTrialBookingChatLink({ storeId: "store", channel: problem === "MESSENGER" ? "MESSENGER" : "LINE",
      chatIdentity: problem === "mismatched_subject" ? "U" + "b".repeat(32) : subject,
      verifiedLogin: { channelId: "2010761154", lineUserId: subject }, notificationVerified: false, now })).rejects.toThrow("TRIAL_LOGIN_PROOF_INVALID");
    expect(db.trialBookingLink.create).not.toHaveBeenCalled();
  });
});
