import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ count: vi.fn(), load: vi.fn(), allocate: vi.fn(), customer: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: m.customer } } }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: { beautyAppointment: { count: m.count } } }));
vi.mock("@/server/beauty/booking", () => ({ loadAvailability: m.load, findAllocation: m.allocate }));
import { beautySlotsForActor } from "@/server/beauty/availability";
import { partyInput } from "@/lib/beauty/contracts";
const input = () => ({ date: "2026-10-27", isTrial: true, people: [{ phone: "0900000000", serviceId: "massage", preference: "ANY" }] });
beforeEach(() => { vi.clearAllMocks(); m.count.mockResolvedValue(0); m.load.mockResolvedValue({ slots: ["09:00", "10:00"] }); m.allocate.mockResolvedValue({}); });
it("checks phone-based trial eligibility in the authorized store without requiring names or contact details", async () => {
  expect(await beautySlotsForActor("public", input(), { storeId: "store", userId: null })).toEqual({ slots: ["09:00", "10:00"] });
  expect(m.count).toHaveBeenCalledWith({ where: { storeId: "store", serviceId: "massage", isTrial: true, status: { not: "CANCELLED" }, OR: [{ personPhone: "0900000000" }] } });
  expect(m.customer).not.toHaveBeenCalled();
  expect(partyInput.safeParse(input()).success).toBe(false);
});
it("rejects missing phone and non-trial requests before looking up availability", async () => {
  await expect(beautySlotsForActor("public", { ...input(), people: [{ ...input().people[0], phone: "" }] }, { storeId: "store", userId: null })).rejects.toThrow();
  await expect(beautySlotsForActor("public", { ...input(), isTrial: false }, { storeId: "store", userId: null })).rejects.toThrow();
  expect(m.count).not.toHaveBeenCalled(); expect(m.load).not.toHaveBeenCalled();
});
it("blocks an already-used trial before reading slots", async () => {
  m.count.mockResolvedValue(1); await expect(beautySlotsForActor("public", input(), { storeId: "store", userId: null })).rejects.toThrow("每人每項服務限體驗一次"); expect(m.load).not.toHaveBeenCalled();
});
it("does not accept forged member, plan, location or identity fields in a public availability read", async () => {
  await beautySlotsForActor("public", { ...input(), people: [{ ...input().people[0], customerId: "victim", cardId: "foreign", specifiedLocationId: "foreign", pendingIdentity: true, isTrial: false }] }, { storeId: "store", userId: null });
  const person = m.allocate.mock.calls[0][2].people[0]; expect(person).toMatchObject({ customerId: null, cardId: null });
  expect(person).not.toHaveProperty("specifiedLocationId"); expect(person).not.toHaveProperty("pendingIdentity");
  expect(m.count.mock.calls[0][0].where.OR).toEqual([{ personPhone: "0900000000" }]);
});
