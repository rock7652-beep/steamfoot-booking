import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ trials:vi.fn(),purchases:vi.fn(),customers: vi.fn(), cards: vi.fn(), attendance: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: mocks.customers } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseTrialPayment:{findMany:mocks.trials},coursePurchase:{findMany:mocks.purchases},coursePointCard: { findMany: mocks.cards }, $queryRaw: mocks.attendance } }));
import { getCourseCustomerCare } from "@/server/queries/course-customer-care";
const now = new Date("2026-09-17T12:00:00Z");
const card = (id: string, remaining: number, held: number, enabled = true, threshold: number | null = 2) => ({ id, nameSnapshot: id, unit: "POINT", remaining, expiresAt: new Date("2026-09-20T15:59:59Z"), plan: { lowBalanceEnabled: enabled, lowBalanceThreshold: threshold }, bookings: [{ pointCost: held }], members: [{ customerId: "a" }, { customerId: "b" }] });
beforeEach(() => { vi.clearAllMocks();mocks.trials.mockResolvedValue([]);mocks.purchases.mockResolvedValue([]); mocks.customers.mockResolvedValue([{ id: "a", name: "A", followUps: [] }, { id: "b", name: "B", followUps: [] }]); mocks.attendance.mockResolvedValue([]); });
describe("course customer care", () => {
  it("checks each shared card available quota without combining units or multiplying members", async () => {
    mocks.cards.mockResolvedValue([card("low", 5, 3), { ...card("other", 100, 0), unit: "SESSION" }]);
    const result = await getCourseCustomerCare("store-a", now);
    expect(result.low).toHaveLength(2);
    expect(result.low[0].cards).toEqual(expect.arrayContaining([expect.objectContaining({ id: "low", remaining: 5, held: 3, available: 2, low: true }), expect.objectContaining({ id: "other", unit: "堂", low: false })]));
    expect(mocks.cards.mock.calls[0][0].where).toMatchObject({ storeId: "store-a", closedAt: null, expiresAt: { gt: now } });
    expect(mocks.customers.mock.calls[0][0].where).toMatchObject({ storeId: "store-a", mergedIntoCustomerId: null });
  });
  it("does not enable missing thresholds or disabled plans", async () => {
    mocks.cards.mockResolvedValue([card("unset", 0, 0, true, null), card("disabled", 0, 0, false)]);
    expect((await getCourseCustomerCare("store-a", now)).low).toEqual([]);
  });
  it("uses course attendance and valid remaining cards for inactive customers", async () => {
    mocks.cards.mockResolvedValue([card("live", 5, 0)]);
    mocks.attendance.mockResolvedValue([{ customerId: "a", lastVisitAt: new Date("2026-08-16T12:00:00Z") }, { customerId: "b", lastVisitAt: new Date("2026-09-16T12:00:00Z") }]);
    const result = await getCourseCustomerCare("store-a", now);
    expect(result.inactive.map(row => row.id)).toEqual(["a"]);
    expect(result.expiring).toHaveLength(2);
  });
});

it("shows paid but unconverted trial customers independently of attendance",async()=>{mocks.cards.mockResolvedValue([]);mocks.trials.mockResolvedValue([{id:"paid",createdAt:now,amount:499,booking:{customerId:"a",status:"RESERVED",session:{startsAt:now}}}]);expect((await getCourseCustomerCare("store-a",now)).trial.map(c=>c.id)).toEqual(["a"]);mocks.purchases.mockResolvedValue([{customerId:"a"}]);expect((await getCourseCustomerCare("store-a",now)).trial).toEqual([]);});
