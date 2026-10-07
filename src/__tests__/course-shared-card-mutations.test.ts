import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  access: vi.fn(), transaction: vi.fn(), state: vi.fn(), music: vi.fn(), raw: vi.fn(),
  plan: vi.fn(), createPlan: vi.fn(), updatePlan: vi.fn(), validateTerm: vi.fn(),
  card: vi.fn(), bookings: vi.fn(), remove: vi.fn(), add: vi.fn(), template: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findFirst: m.music } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseTemplate: { count: vi.fn().mockResolvedValue(1), findFirst: m.template } } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.access, courseTransaction: m.transaction }));
vi.mock("@/server/services/course-shared-card", () => ({ getCourseSharedCardStateInTransaction: m.state }));
vi.mock("@/server/services/course-term", () => ({ validateCourseTerm: m.validateTerm }));
vi.mock("@/server/services/course-booking", () => ({}));
vi.mock("@/server/services/course-waitlist", () => ({}));
vi.mock("@/server/services/course-display-order", () => ({}));
vi.mock("@/server/services/music-subject-rule", () => ({}));
vi.mock("@/server/services/course-low-balance-schedule", () => ({}));
vi.mock("@/server/services/course-assignment-checkout", () => ({}));
vi.mock("@/server/services/operation-audit-outbox", () => ({}));
vi.mock("@/lib/music-course-products", () => ({ musicPlanQuote: () => ({ lessons: 10, price: 100, validDays: 30 }) }));

import { saveCoursePointPlan, setCourseCardMembers } from "@/server/actions/course-members";

const planInput = { name: "自由選課", points: 10, price: 100, validDays: 30, unit: "POINT", templateIds: [], termSessionIds: [] };
const oldPlan = { id: "plan", ...planInput, allowShared: true };
const tx = {
  coursePointPlan: { findFirst: m.plan, create: m.createPlan, updateMany: m.updatePlan },
  coursePointCard: { findFirst: m.card }, courseBooking: { findMany: m.bookings },
  courseCardMember: { deleteMany: m.remove, createMany: m.add }, $queryRaw: m.raw,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ storeId: "sports", user: { id: "manager" } });
  m.transaction.mockImplementation((_storeId, work) => work(tx));
  m.music.mockResolvedValue(null);
  m.state.mockResolvedValue("ENABLED");
  m.plan.mockResolvedValue(null);
  m.updatePlan.mockResolvedValue({ count: 1 });
  m.validateTerm.mockResolvedValue([]);
  m.card.mockResolvedValue({ id: "card", termSessionIds: [], plan: { allowShared: true }, members: [{ customerId: "owner" }, { customerId: "existing" }] });
  m.bookings.mockResolvedValue([]);
  m.raw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes('"Customer"') ? [{ id: "customer" }] : []);
});

describe("shared-card plan mutations", () => {
  it.each(["LOCKED", "HIDDEN"])("blocks creating and enabling sharing while %s", async state => {
    m.state.mockResolvedValue(state);
    expect(await saveCoursePointPlan({ ...planInput, allowShared: true })).toMatchObject({ success: false, error: expect.stringContaining("共卡功能尚未開通") });
    m.plan.mockResolvedValue({ ...oldPlan, allowShared: false });
    expect((await saveCoursePointPlan({ ...planInput, id: "plan", allowShared: true })).success).toBe(false);
    expect(m.createPlan).not.toHaveBeenCalled();
    expect(m.updatePlan).not.toHaveBeenCalled();
    expect(m.state).toHaveBeenCalledWith(tx, "sports");
  });

  it("permits new sharing only after authorization is enabled", async () => {
    expect((await saveCoursePointPlan({ ...planInput, allowShared: true })).success).toBe(true);
    expect(m.createPlan).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: "sports", allowShared: true }) });
    expect(m.access).toHaveBeenCalledWith("plans.edit");
  });

  it.each(["LOCKED", "HIDDEN"])("preserves explicit and omitted existing sharing while %s", async state => {
    m.state.mockResolvedValue(state);
    m.plan.mockResolvedValue(oldPlan);
    for (const data of [{ allowShared: true }, {}]) {
      expect((await saveCoursePointPlan({ ...planInput, id: "plan", name: "更名", ...data })).success).toBe(true);
      expect(m.updatePlan).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ allowShared: true }) }));
    }
    expect(m.state).not.toHaveBeenCalled();
  });

  it("permits an intentional sharing disable and ordinary new unshared plan", async () => {
    m.state.mockResolvedValue("HIDDEN");
    m.plan.mockResolvedValue(oldPlan);
    expect((await saveCoursePointPlan({ ...planInput, id: "plan", allowShared: false })).success).toBe(true);
    expect(m.updatePlan).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ allowShared: false }) }));
    expect((await saveCoursePointPlan(planInput)).success).toBe(true);
    expect(m.createPlan).toHaveBeenCalledWith({ data: expect.objectContaining({ allowShared: false }) });
  });

  it("does not apply the sports feature to existing music plan workflows", async () => {
    m.music.mockResolvedValue({ storeId: "sports" });
    m.raw.mockResolvedValue([{ featureKey: "business.music" }]);
    m.state.mockResolvedValue("HIDDEN");
    m.template.mockResolvedValue({ musicTermLessons: 10 });
    expect((await saveCoursePointPlan({ ...planInput, unit: "SESSION", templateIds: ["music-template"], musicTerms: 1, allowShared: true })).success).toBe(true);
    expect(m.state).not.toHaveBeenCalled();
  });

  it.each([false, true])("rejects a stale music profile before allowing new sharing (initial music=%s)", async initialMusic => {
    m.music.mockResolvedValue(initialMusic ? { storeId: "sports" } : null);
    m.raw.mockResolvedValue(initialMusic ? [] : [{ featureKey: "business.music" }]);
    m.state.mockResolvedValue("ENABLED");
    m.template.mockResolvedValue({ musicTermLessons: 10 });
    const input = initialMusic
      ? { ...planInput, unit: "SESSION", templateIds: ["music-template"], musicTerms: 1, allowShared: true }
      : { ...planInput, allowShared: true };
    expect(await saveCoursePointPlan(input)).toMatchObject({ success: false, error: "店家課程類型已變更，請重新確認方案" });
    expect(m.createPlan).not.toHaveBeenCalled();
    expect(m.updatePlan).not.toHaveBeenCalled();
    expect(m.state).not.toHaveBeenCalled();
  });
});

describe("shared-card membership mutations", () => {
  it.each(["LOCKED", "HIDDEN"])("blocks new named members while %s", async state => {
    m.state.mockResolvedValue(state);
    expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner", "new"] })).toMatchObject({ success: false, error: expect.stringContaining("不能新增共卡成員") });
    expect(m.add).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("requires both the feature and the individual plan for additions", async () => {
    expect((await setCourseCardMembers({ cardId: "card", customerIds: ["owner", "new"] })).success).toBe(true);
    expect(m.access).toHaveBeenCalledWith("wallet.create");
    expect(m.state).toHaveBeenCalledWith(tx, "sports");
    m.card.mockResolvedValue({ id: "card", termSessionIds: [], plan: { allowShared: false }, members: [{ customerId: "owner" }] });
    expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner", "new"] })).toMatchObject({ success: false, error: "此方案未開放共卡" });
  });

  it("allows removals after either feature or plan sharing is disabled", async () => {
    m.state.mockResolvedValue("HIDDEN");
    m.card.mockResolvedValue({ id: "card", termSessionIds: [], plan: { allowShared: false }, members: [{ customerId: "owner" }, { customerId: "existing" }] });
    expect((await setCourseCardMembers({ cardId: "card", customerIds: ["owner"] })).success).toBe(true);
    expect(m.remove).toHaveBeenCalledWith({ where: { cardId: "card", storeId: "sports", customerId: { notIn: ["owner"] } } });
    expect(m.state).not.toHaveBeenCalled();
  });

  it("still rejects removal of someone with an unfinished reservation", async () => {
    m.bookings.mockResolvedValue([{ customerId: "existing", operatorCustomerId: "owner", companionIndex: null }]);
    expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner"] })).toMatchObject({ success: false, error: expect.stringContaining("尚未完成的預約") });
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("still validates same-store customers and fixed-term restrictions", async () => {
    m.raw.mockResolvedValue([]);
    expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner", "external"] })).toMatchObject({ success: false, error: "共卡只能加入本店顧客" });
    m.card.mockResolvedValue({ id: "card", termSessionIds: ["term"], plan: { allowShared: true }, members: [{ customerId: "owner" }] });
    expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner"] })).toMatchObject({ success: false, error: expect.stringContaining("期課為指定學員") });
  });

  it("preserves the music member path without enabling sports sharing", async () => {
    m.state.mockResolvedValue("HIDDEN");
    m.raw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes('"StoreFeatureEntitlement"') ? [{ featureKey: "business.music" }] : [{ id: "customer" }]);
    expect((await setCourseCardMembers({ cardId: "card", customerIds: ["owner", "new"] })).success).toBe(true);
    expect(m.state).not.toHaveBeenCalled();
  });
});


it("keeps music's existing per-plan restriction even for member removals", async () => {
  m.raw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes('"StoreFeatureEntitlement"') ? [{ featureKey: "business.music" }] : [{ id: "customer" }]);
  m.card.mockResolvedValue({ id: "card", termSessionIds: [], plan: { allowShared: false }, members: [{ customerId: "owner" }, { customerId: "existing" }] });
  expect(await setCourseCardMembers({ cardId: "card", customerIds: ["owner"] })).toMatchObject({ success: false, error: "此方案未開放共卡" });
  expect(m.remove).not.toHaveBeenCalled();
});
