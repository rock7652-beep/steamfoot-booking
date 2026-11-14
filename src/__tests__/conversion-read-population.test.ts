import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bookings: vi.fn(), purchases: vi.fn(), hydrate: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: m.bookings }, transaction: { findMany: m.purchases } } }));
vi.mock("@/server/queries/booking-participant-facts", () => ({ loadIndividualBookingFacts: async () => ({ groupIds: new Set(), visits: [] }), replaceGroupedBookingFacts: (rows: unknown[]) => rows }));
vi.mock("@/server/queries/customer-segment-list", () => ({ hydrateCustomerSegment: m.hydrate }));
import { getConversionCustomers, loadConversionFacts, selectRenewalCustomerIds } from "@/server/queries/conversion-metrics";
beforeEach(() => {
 vi.clearAllMocks(); m.bookings.mockResolvedValue([]);
 m.purchases.mockResolvedValue([
  { id: "first", customerId: "no-trial", transactionDate: new Date("2026-09-01T04:00:00Z"), paidAt: null, amount: 100, refunds: [], customerPlanWallet: { id: "first-wallet", status: "ACTIVE" } },
  { id: "renewal", customerId: "no-trial", transactionDate: new Date("2026-11-04T04:00:00Z"), paidAt: null, amount: 100, refunds: [], customerPlanWallet: { id: "second-wallet", status: "ACTIVE" } },
 ]);
 m.hydrate.mockImplementation(async (storeId: string, ids: Set<string>) => [...ids].map(id => ({storeId, customerId: id})));
});
it("reads paid store history even when there are no trial records and retains wallet identity", async () => {
 const facts = await loadConversionFacts("viewed-store", ["2026-11"]);
 expect(m.purchases).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({storeId: "viewed-store", customerId: {not: null}, status: "SUCCESS", paymentStatus: {in: ["SUCCESS", "CONFIRMED"]}})}));
 expect(selectRenewalCustomerIds("2026-11", facts.purchases).size).toBe(1);
});
it("uses the same renewal selection for its store-scoped customer drill-down", async () => {
 const people = await getConversionCustomers("viewed-store", "2026-11", "monthly-renewed");
 expect(people).toEqual([{storeId: "viewed-store", customerId: "no-trial"}]);
 expect(m.hydrate).toHaveBeenCalledWith("viewed-store", new Set(["no-trial"]));
});

it("backfills the opening and trial drill-down to the trial period when payment arrives next month", async () => {
 m.bookings.mockResolvedValue([{id:"trial",customerId:"cross",bookingDate:new Date("2026-10-25T00:00:00Z"),people:1,attendedPeople:1}]);
 m.purchases.mockResolvedValue([{id:"opening",customerId:"cross",transactionDate:new Date("2026-11-04T04:00:00Z"),paidAt:null,amount:100,refunds:[],customerPlanWallet:{id:"wallet",status:"ACTIVE"}}]);
 expect(await getConversionCustomers("viewed-store","2026-10","monthly-converted")).toEqual([{storeId:"viewed-store",customerId:"cross"}]);
 expect(await getConversionCustomers("viewed-store","2026-10","monthly-conversion-trial")).toEqual([{storeId:"viewed-store",customerId:"cross"}]);
 expect(await getConversionCustomers("viewed-store","2026-11","monthly-converted")).toEqual([]);
});
