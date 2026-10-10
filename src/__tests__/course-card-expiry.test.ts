import { describe, expect, it } from "vitest";
import { courseCardActiveExpiryWhere, courseCardCoversDate, courseCardHasVerifiedNoExpiry } from "@/lib/course-card-expiry";
import { syntheticOpeningCard, syntheticOpeningRecord } from "./fixtures/music-opening";
import { courseCardIsLow } from "@/lib/course-low-balance";

function noExpiryCard() {
  const record = syntheticOpeningRecord();
  record.expiresAt = null; record.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-source-proof" };
  return { ...syntheticOpeningCard(record), expiresAt: null, musicValidityDays: null };
}
describe("ordinary course expiry policy", () => {
  it("verified no-expiry is usable after cutoff, without a distant fake date", () => {
    const card = noExpiryCard();
    expect(courseCardHasVerifiedNoExpiry(card, card.storeId)).toBe(true);
    expect(courseCardCoversDate(card, card.storeId, new Date("2120-01-01T00:00:00Z"))).toBe(true);
    expect(courseCardCoversDate(card, card.storeId, new Date("2026-09-30T15:59:59Z"))).toBe(false);
    expect(courseCardCoversDate(card, card.storeId, new Date("invalid"))).toBe(false);
  });
  it.each(["missing-state", "wrong-store", "wrong-hash", "sentinel", "activation", "validity-days"])("fails closed for %s", issue => {
    const card = noExpiryCard();
    if (issue === "missing-state") Object.assign(card, { musicOpeningState: null });
    if (issue === "wrong-hash") card.musicOpeningState.contentHash = "a".repeat(64);
    if (issue === "sentinel") Object.assign(card, { expiresAt: new Date("2099-12-31") });
    if (issue === "activation") Object.assign(card, { musicActivatedAt: null });
    if (issue === "validity-days") Object.assign(card, { musicValidityDays: 35 });
    const storeId = issue === "wrong-store" ? "different-store" : card.storeId;
    expect(courseCardHasVerifiedNoExpiry(card, storeId)).toBe(false);
    expect(courseCardCoversDate(card, storeId, new Date("2026-10-08"))).toBe(false);
  });
  it("unknown imported and missing native dates are not unlimited", () => {
    const record = syntheticOpeningRecord(); record.expiresAt = null; record.expiryVerification = { kind: "UNKNOWN" };
    const card = { ...syntheticOpeningCard(record), expiresAt: null };
    expect(courseCardHasVerifiedNoExpiry(card, card.storeId)).toBe(false);
    expect(courseCardCoversDate(card, card.storeId, new Date("2026-10-08"))).toBe(false);
    expect(courseCardCoversDate({ expiresAt: null }, "native-store", new Date("2026-10-08"))).toBe(false);
  });
  it("preserves native first-use sentinel and finite expiry boundaries", () => {
    const sentinel = { expiresAt: new Date("2099-12-31"), musicValidityDays: 35, musicActivatedAt: null };
    expect(courseCardCoversDate(sentinel, "native", new Date("2026-10-08"))).toBe(true);
    expect(courseCardHasVerifiedNoExpiry(sentinel, "native")).toBe(false);
    const card = syntheticOpeningCard();
    expect(courseCardCoversDate(card, card.storeId, card.expiresAt)).toBe(true);
    expect(courseCardCoversDate(card, card.storeId, new Date(card.expiresAt.getTime() + 1))).toBe(false);
  });
  it("SQL candidates require explicit no-expiry source state", () => {
    expect(courseCardActiveExpiryWhere(new Date("2026-10-08"))).toMatchObject({ OR: [
      { expiresAt: { gt: expect.any(Date) } },
      { expiresAt: null, musicOpeningStateRequired: true, musicOpeningState: { is: { snapshot: { path: ["record", "expiryVerification", "kind"], equals: "NO_EXPIRY" } } } },
    ] });
  });
  it("low-balance logic includes verified unlimited but not an unverified null", () => {
    const data = { enabled: true, threshold: 2, remaining: 2, held: 0, closed: false, expiresAt: null };
    expect(courseCardIsLow(data)).toBe(false);
    expect(courseCardIsLow({ ...data, verifiedNoExpiry: true })).toBe(true);
  });
});
