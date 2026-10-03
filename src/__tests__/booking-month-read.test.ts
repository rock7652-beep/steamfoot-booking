import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/server/actions/booking-refresh", () => ({ refreshBookingManagement: mocks.action }));
import { readBookingMonth } from "@/lib/booking-month-read";
const request = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", request); });
afterEach(() => vi.unstubAllGlobals());
it("uses a private read without an action, retaining wallet, confirmation dates and notes", async () => {
  const date = "2026-10-01T00:00:00.000Z";
  request.mockResolvedValue(new Response(JSON.stringify({ monthData: [{ date: "2026-10-01", bookings: [{ customerConfirmedAt: date, notes: date, customerPlanWallet: { remainingSessions: 7, expiryDate: date } }] }], monthSchedule: {}, slots: null })));
  const result = await readBookingMonth({ year: 2026, month: 10, storeId: "store-a" });
  expect(request).toHaveBeenCalledWith("/api/bookings/month?year=2026&month=10&storeId=store-a", { cache: "no-store", credentials: "same-origin" });
  expect(mocks.action).not.toHaveBeenCalled();
  const booking = result.monthData[0].bookings[0];
  expect(booking.customerConfirmedAt).toEqual(new Date(date));
  expect(booking.customerPlanWallet?.expiryDate).toEqual(new Date(date));
  expect(booking.customerPlanWallet?.remainingSessions).toBe(7);
  expect(booking).toMatchObject({ notes: date });
  expect(result.monthData[0].date).toBe("2026-10-01");
});
it("retains the session-scoped action for ADMIN's all-store view", async () => {
  await readBookingMonth({ year: 2026, month: 10 });
  expect(request).not.toHaveBeenCalled();
  expect(mocks.action).toHaveBeenCalledWith({ year: 2026, month: 10, date: null });
});
it.each([401, 403, 503])("fails without returning an empty calendar or fallback on HTTP %s", async (status) => {
  request.mockResolvedValue(new Response("{}", { status }));
  await expect(readBookingMonth({ year: 2026, month: 10, storeId: "s" })).rejects.toThrow();
  expect(mocks.action).not.toHaveBeenCalled();
});
it("rejects a login page returned as HTML instead of treating it as data", async () => {
  request.mockResolvedValue(new Response("<html>登入</html>"));
  await expect(readBookingMonth({ year: 2026, month: 10, storeId: "s" })).rejects.toThrow();
});
it("refreshes the selected day over HTTP without a page-rendering action", async () => {
  const slots = [{ startTime: "10:00", capacity: 3, bookedCount: 1, available: 2, isEnabled: true, isPast: false }];
  request.mockResolvedValue(Response.json({ monthData: [], monthSchedule: {}, slots }));
  const result = await readBookingMonth({ year: 2026, month: 10, storeId: "store-a", date: "2026-10-01" });
  expect(request).toHaveBeenCalledWith("/api/bookings/month?year=2026&month=10&storeId=store-a&date=2026-10-01", { cache: "no-store", credentials: "same-origin" });
  expect(result.slots).toEqual(slots);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps all-store selected-day scope in the legacy fallback", async () => {
  await readBookingMonth({ year: 2026, month: 10, date: "2026-10-01" });
  expect(mocks.action).toHaveBeenCalledWith({ year: 2026, month: 10, date: "2026-10-01" });
});

it("preserves null slots when the selected store differs from the active scope", async () => {
  request.mockResolvedValue(Response.json({ monthData: [], monthSchedule: {}, slots: null }));
  expect((await readBookingMonth({ year: 2026, month: 10, storeId: "store-b", date: "2026-10-01" })).slots).toBeNull();
  expect(mocks.action).not.toHaveBeenCalled();
});
it("rejects malformed selected-day slots without retrying via an action", async () => {
  request.mockResolvedValue(Response.json({ monthData: [], monthSchedule: {}, slots: {} }));
  await expect(readBookingMonth({ year: 2026, month: 10, storeId: "store-a", date: "2026-10-01" })).rejects.toThrow();
  expect(mocks.action).not.toHaveBeenCalled();
});

it("stamps labels in request-start order, even when responses finish out of order",async()=>{let finish!:(value:Response)=>void;request.mockReturnValueOnce(new Promise(resolve=>finish=resolve));const body={monthData:[],monthSchedule:{},slots:null,customerLabels:{assignments:{}}};const older=readBookingMonth({year:2026,month:9,storeId:"s"});request.mockResolvedValueOnce(Response.json(body));const newer=await readBookingMonth({year:2026,month:10,storeId:"s"});finish(Response.json(body));expect((await older).customerLabels!.clientRevision).toBeLessThan(newer.customerLabels!.clientRevision!);});
