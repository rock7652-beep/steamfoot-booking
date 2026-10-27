import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), entry: vi.fn(), member: vi.fn(), onboard: vi.fn(), reserve: vi.fn(), previous: vi.fn(), raw: vi.fn(), execute: vi.fn(), rule: vi.fn(), settings: vi.fn(), session: vi.fn(), probe: vi.fn(), gate: vi.fn(), sessions: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { shopConfig: { findUnique: vi.fn() } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findUnique: m.previous }, courseBookingRule: { findUnique: m.gate }, courseSession: { findMany: m.sessions }, $queryRaw: m.raw } }));
vi.mock("@/server/services/sports-public-trial-store", () => ({ requireSportsPublicTrialStore: m.store }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: 100 }) }));
vi.mock("@/lib/shop-config", () => ({ getTrialSettings: m.settings, clampTrialTotal: (n: number) => n, resolveCustomerBookingWindow: () => ({ closesAt: new Date("2099-01-01") }) }));
vi.mock("@/lib/store-line-config", () => ({ getConfiguredStoreLine: () => ({ storeId: "store" }), storeLineIdentityProvider: () => "line-provider:901" }));
vi.mock("@/lib/line", () => ({ probeStoreLineRecipient: m.probe }));
vi.mock("@/server/services/trial-booking-chat-link", () => ({ resolveTrialBookingChatLink: m.entry }));
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: m.member }));
vi.mock("@/server/services/course-line-onboarding", () => ({ onboardCourseLineMember: m.onboard }));
vi.mock("@/server/services/sports-staging-schedule", () => ({ readSportsSessionRule: m.rule }));
vi.mock("@/server/services/sports-production-readiness", () => ({ assertSportsProductionReady: vi.fn() }));
vi.mock("@/server/services/course-booking", () => ({ reserveCourseInTransaction: m.reserve }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: async (_: string, work: (tx: unknown) => Promise<unknown>) => work({ courseBooking: { findUnique: m.previous }, courseSession: { findFirst: m.session }, $queryRaw: m.raw, $executeRaw: m.execute }) }));
import { readSportsPublicTrial, submitSportsPublicTrial } from "@/server/services/sports-public-trial";
const input = { sessionId: "session", requestKey: "cc94047d-89f4-4db4-94ba-c9fb424bf992", expectedPrice: 500, name: "測試學員", phone: "0912-345-678", consent: true, entry: "link.secret" };
beforeEach(() => {
  vi.resetAllMocks();
  m.store.mockResolvedValue({ id: "store", slug: "silverlily", name: "銀百合" });
  m.settings.mockResolvedValue({ trialEnabled: true });
  m.entry.mockResolvedValue({ linkId: "link", storeId: "store", channel: "LINE", chatIdentity: "U" + "a".repeat(32) });
  m.member.mockResolvedValue({ id: "customer", userId: "user", name: "既有姓名" });
  m.probe.mockResolvedValue({ status: "COMPATIBLE" });
  m.rule.mockResolvedValue({ enrollment: "OPEN", planId: null, trialPrice: 500 });
  m.session.mockResolvedValue({ chargeSnapshot: null });
  m.gate.mockResolvedValue({ selfBookingEnabled: true });
  m.sessions.mockResolvedValue([{ id: "session", nameSnapshot: "體驗課", startsAt: new Date("2030-11-01"), endsAt: new Date("2030-11-02"), capacity: 5, chargeSnapshot: null, _count: { bookings: 1 } }]);
  m.previous.mockResolvedValue(null);
  m.raw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('"TrialBookingLink"')) return [{ id: "link" }];
    if (sql.includes('"Customer" c')) return [{ id: "customer", lineLinkStatus: "LINKED" }];
    if (sql.includes('"ShopConfig"')) return [{ trialEnabled: true }];
    if (sql.includes('"SportsStagingSessionRule"')) return [{ sessionId: "session", enrollment: "OPEN", planId: null, trialPrice: 500 }];
    return [];
  });
});
it("books only verified same-store identity, preserving contact ownership and one-time redemption", async () => {
  await expect(submitSportsPublicTrial("silverlily", input)).resolves.toEqual({ sessionId: "session", price: 500 });
  expect(m.onboard).not.toHaveBeenCalled();
  expect(m.reserve).toHaveBeenCalledWith(expect.anything(), { storeId: "store", userId: "user", name: "既有姓名", customerId: "customer" }, expect.objectContaining({ cardId: null, customerId: "customer", trialPrice: 500 }), 100, { sportsMemberTrial: true });
  expect(m.execute).toHaveBeenCalledOnce();
});
it.each([null, { linkId: "link", storeId: "other", channel: "LINE" }, { linkId: "link", storeId: "store", channel: "MESSENGER" }])("rejects invalid/cross-store capability before membership or booking writes", async entry => {
  m.entry.mockResolvedValue(entry);
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow();
  expect(m.onboard).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
});
it("requires provider compatibility", async () => {
  m.probe.mockResolvedValue({ status: "INCOMPATIBLE" });
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow();
  expect(m.reserve).not.toHaveBeenCalled();
});
it("does not take an existing phone record when onboarding needs review", async () => {
  m.member.mockResolvedValue(null); m.onboard.mockResolvedValue({ status: "identity_review_required" });
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("門市核對");
  expect(m.onboard).toHaveBeenCalledWith(expect.objectContaining({ phone: "0912345678", identityProvider: "line-provider:901" }));
  expect(m.reserve).not.toHaveBeenCalled();
});
it("registers a new verified visitor through existing onboarding before creating their trial", async () => {
  m.member.mockResolvedValueOnce(null).mockResolvedValue({ id: "new-customer", userId: "new-user", name: "新學員" });
  m.onboard.mockResolvedValue({ status: "ok" });
  await expect(submitSportsPublicTrial("silverlily", input)).resolves.toEqual({ sessionId: "session", price: 500 });
  expect(m.onboard).toHaveBeenCalledOnce();
  expect(m.reserve.mock.calls[0][1]).toEqual(expect.objectContaining({ customerId: "new-customer", userId: "new-user" }));
});
it("does not register a first-time visitor when public selection is closed", async () => {
  m.member.mockResolvedValue(null); m.gate.mockResolvedValue({ selfBookingEnabled: false });
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("已更新");
  expect(m.onboard).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
});
it.each([{ enrollment: "ASSIGNED", planId: null, trialPrice: 500 }, { enrollment: "OPEN", planId: "paid", trialPrice: 500 }, { enrollment: "OPEN", planId: null, trialPrice: 600 }])("rejects changed course/price before consuming the entry", async rule => {
  m.rule.mockResolvedValue(rule);
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("已更新");
  expect(m.reserve).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
it("does not consume an entry when the existing capacity/time guard rejects", async () => {
  m.reserve.mockRejectedValue(new Error("本堂課已滿班"));
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("滿班");
  expect(m.execute).not.toHaveBeenCalled();
});
it("rejects an already-consumed entry under the store lock", async () => {
  m.raw.mockResolvedValue([]);
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("已失效");
  expect(m.reserve).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
it("does not book after identity authorization has been revoked", async () => {
  m.raw.mockResolvedValueOnce([{ id: "link" }]).mockResolvedValueOnce([]);
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("核對");
  expect(m.reserve).not.toHaveBeenCalled();
});
it("rechecks the trial switch under the lock before booking", async () => {
  m.raw.mockResolvedValueOnce([{ id: "link" }]).mockResolvedValueOnce([{ id: "customer", lineLinkStatus: "LINKED" }]).mockResolvedValueOnce([{ trialEnabled: false }]);
  await expect(submitSportsPublicTrial("silverlily", input)).rejects.toThrow("已關閉");
  expect(m.reserve).not.toHaveBeenCalled();
});
it("recovers the exact committed request without booking again and rejects altered contact data", async () => {
  await submitSportsPublicTrial("silverlily", input);
  const saved = m.reserve.mock.calls[0][2];
  m.previous.mockResolvedValue({ groupKey: saved.groupKey });
  m.reserve.mockClear(); m.entry.mockClear();
  await expect(submitSportsPublicTrial("silverlily", input)).resolves.toEqual({ sessionId: "session", price: 500 });
  expect(m.reserve).not.toHaveBeenCalled(); expect(m.entry).not.toHaveBeenCalled();
  await expect(submitSportsPublicTrial("silverlily", { ...input, phone: "0999999999" })).rejects.toThrow("已使用");
});
it("requires consent and rejects attempts to supply membership/overcapacity fields", async () => {
  for (const data of [{ ...input, consent: false }, { ...input, customerId: "other" }, { ...input, allowOverCapacity: true }])
    await expect(submitSportsPublicTrial("silverlily", data)).rejects.toThrow();
  expect(m.reserve).not.toHaveBeenCalled();
});
it("keeps closed public selection empty without changing store switches", async () => {
  m.gate.mockResolvedValue({ selfBookingEnabled: false });
  expect((await readSportsPublicTrial("silverlily")).slots).toEqual([]);
  expect(m.sessions).not.toHaveBeenCalled();
});
