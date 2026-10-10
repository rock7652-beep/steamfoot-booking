import { describe, expect, it } from "vitest";
import { summarizeBookingParticipants, summarizeParticipantConversion, type BookingParticipantFact, type ParticipantPurchaseFact } from "@/lib/booking-participant-summary";
import { trialCollectionAmountError } from "@/lib/trial-collection-amount";

const fact = (id: string, patch: Partial<BookingParticipantFact> = {}): BookingParticipantFact => ({
  id, customerId: id, source: "RESERVATION", service: "TRIAL", status: "COMPLETED", arrived: true,
  trialPayment: { received: true, netAmount: 499 }, ...patch,
});
const sale = (customerId: string, patch: Partial<ParticipantPurchaseFact> = {}): ParticipantPurchaseFact => ({
  customerId, storeId: "a", date: "2026-11-01", paid: true, voided: false, netAmount: 5990, ownPurchase: true, ...patch,
});
const conversion = (trials: { storeId: string; customerId: string | null; date: string }[], purchases: ParticipantPurchaseFact[]) => summarizeParticipantConversion({
  storeId: "a", startDate: "2026-10-01", endDate: "2026-10-31", asOfDate: "2026-11-30", trials, purchases,
});
describe("individual attendance and collection", () => {
  it("keeps a two-person group pending after only one checkout", () => {
    expect(summarizeBookingParticipants([fact("a"), fact("b", { status: "PENDING", arrived: false, trialPayment: null })])).toMatchObject({
      originalPeople: 2, completedPeople: 1, trialNetRevenue: 499, resolved: false,
    });
  });
  it("resolves a no-show and one walk-in without rewriting original attendance rate", () => {
    expect(summarizeBookingParticipants([fact("a"), fact("b", { status: "NO_SHOW", arrived: false, trialPayment: null }), fact("c", { source: "WALK_IN" })])).toMatchObject({
      originalPeople: 2, reservedArrivals: 1, walkInPeople: 1, arrivalPeople: 2, trialVisits: 2, noShowPeople: 1, trialNetRevenue: 998, resolved: true,
    });
  });
  it("counts cardholder and shared-card guest as service, only the trial guest as trial", () => {
    expect(summarizeBookingParticipants([fact("a", { service: "PACKAGE", trialPayment: null }), fact("b"), fact("c", { service: "PACKAGE", trialPayment: null })])).toMatchObject({ arrivalPeople: 3, trialVisits: 1, trialNetRevenue: 499 });
  });
  it("retains an unidentified person and does not duplicate them when linked", () => {
    const before = summarizeBookingParticipants([fact("a"), fact("b", { customerId: null })]);
    const after = summarizeBookingParticipants([fact("a"), fact("b", { customerId: "member-b" })]);
    expect(before.trialVisits).toBe(2); expect(before.unidentifiedTrialVisits).toBe(1);
    expect(after.trialVisits).toBe(2); expect(after.trialCustomers).toBe(2);
  });
  it("refund changes money, not historical attendance", () => {
    expect(summarizeBookingParticipants([fact("a", { trialPayment: { received: true, netAmount: 0 } })])).toMatchObject({ trialVisits: 1, trialNetRevenue: 0 });
  });
  it("refuses duplicate slots and unpaid completion", () => {
    expect(() => summarizeBookingParticipants([fact("a"), fact("a")])).toThrow(/重複/);
    expect(() => summarizeBookingParticipants([fact("a", { trialPayment: null })])).toThrow(/收款/);
  });
});
describe("same customer and store conversion cohort", () => {
  const trials = [{ storeId: "a", customerId: "one", date: "2026-10-09" }, { storeId: "a", customerId: "two", date: "2026-10-09" }];
  it("attributes next-month purchase back to trial month, not the companion", () => {
    expect(conversion(trials, [sale("one")])).toMatchObject({ convertedCustomerIds: ["one"], conversionRate: 50 });
  });
  it("deduplicates repeat trials and multiple purchases", () => {
    expect(conversion([...trials, trials[0]], [sale("one"), sale("one")])).toMatchObject({ trialCustomerIds: ["one", "two"], conversionRate: 50 });
  });
  it("cross-store card purchase, shared usage, unpaid and refunded cards cannot convert", () => {
    expect(conversion(trials, [sale("one", { storeId: "b" }), sale("two", { ownPurchase: false }), sale("one", { paid: false }), sale("two", { netAmount: 0 }), sale("one", { voided: true })]).conversionRate).toBe(0);
  });
  it("excludes preexisting cardholder from new trial conversion", () => {
    expect(conversion(trials, [sale("one", { date: "2026-09-01" }), sale("one"), sale("two")])).toMatchObject({ trialCustomerIds: ["two"], convertedCustomerIds: ["two"], conversionRate: 100 });
  });
  it("reports anonymous coverage rather than inventing identity", () => {
    expect(conversion([...trials, { storeId: "a", customerId: null, date: "2026-10-09" }], [])).toMatchObject({ unidentifiedTrialVisits: 1, identityCoverageComplete: false });
  });
});
describe("actual amount is never silently reduced", () => {
  const settings = { trialAllowPriceEdit: true, trialDefaultPrice: 499, trialMinPrice: 0, trialMaxPrice: 3000 };
  it("rejects 11980 on a two-person trial and leaves valid 998 unchanged", () => {
    expect(trialCollectionAmountError(11980, 2, settings)).toMatch(/尚未儲存.*方案/);
    expect(trialCollectionAmountError(998, 2, settings)).toBeNull();
  });
  it("does not silently replace money when editing is disabled", () => {
    expect(trialCollectionAmountError(11980, 2, { ...settings, trialAllowPriceEdit: false })).toMatch(/固定/);
  });
});
