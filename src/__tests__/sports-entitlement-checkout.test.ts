import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";

vi.mock("@/server/services/course-term", () => ({ validateCourseTerm: async () => [], enrollCourseTerm: vi.fn() }));
vi.mock("@/server/services/course-sale-allocation", () => ({ courseSaleSnapshot: async () => ({ storeCostSnapshot: 0, developerProfitSnapshot: 0, developerNameSnapshot: null, revenueStaffId: null }) }));
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";

const cardCreate = vi.fn(), purchaseCreate = vi.fn(), planFind = vi.fn();
const tx = {
  coursePurchase: { findUnique: async () => null, create: purchaseCreate },
  coursePointCard: { findUnique: async () => null, create: cardCreate },
  coursePointPlan: { findFirst: planFind },
  $queryRaw: async () => [{ id: "learner" }],
  $executeRaw: vi.fn(),
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  cardCreate.mockImplementation(async ({ data }) => ({ id: "card", ...data }));
  purchaseCreate.mockImplementation(async ({ data }) => ({ id: "purchase", ...data }));
});

it.each([
  { sportsMode: "LEGACY", sportsSubjectId: null, sportsCost: null },
  { sportsMode: "ASSIGNED", sportsSubjectId: "yoga", sportsCost: 2 },
  { sportsMode: "OPEN", sportsSubjectId: null, sportsCost: null },
])("copies $sportsMode rights into both the granted card and confirmed purchase", async rights => {
  planFind.mockResolvedValue({ id: "plan", storeId: "store", name: "方案", points: 10, price: 1000, validDays: 30, unit: "POINT", templateIds: [], storeCost: 0, ...rights });
  const result = await assignCourseWithCheckout(tx, { storeId: "store", userId: "manager" }, {
    planId: "plan", customerId: "learner", expiresDate: "2099-01-01", requestKey: "sale",
    expectedListPrice: 1000, expectedStoreCost: 0, revenueStaffId: "", discountKind: "AMOUNT", discountValue: 0, paymentMethod: "OTHER", transferLastFour: "",
  });
  expect(planFind).toHaveBeenCalledWith({ where: { id: "plan", storeId: "store", isActive: true } });
  expect(cardCreate.mock.calls[0][0].data).toMatchObject({ ...rights, storeId: "store", remaining: 10 });
  expect(purchaseCreate.mock.calls[0][0].data).toMatchObject({ ...rights, storeId: "store", cardId: "card", status: "CONFIRMED", price: 1000 });
  expect(result).toMatchObject(rights);
});
