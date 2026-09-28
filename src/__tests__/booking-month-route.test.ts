import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/server/actions/booking-refresh", () => ({ refreshBookingManagement: mocks.action }));
import { GET } from "@/app/api/bookings/month/route";
import { AppError } from "@/lib/errors";
beforeEach(() => vi.resetAllMocks());
it("passes explicit scope to the permission-checked service and never accepts day-slot scope", async () => {
  const data = { monthData: [], monthSchedule: {}, slots: null };
  mocks.action.mockResolvedValue(data);
  const response = await GET(new Request("https://example.test/api/bookings/month?year=2026&month=10&storeId=store-a&date=2026-10-01"));
  expect(mocks.action).toHaveBeenCalledWith({ year: 2026, month: 10, storeId: "store-a", date: null });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual(data);
});
it("requires an explicit store", async () => {
  expect((await GET(new Request("https://example.test/api/bookings/month?year=2026&month=10"))).status).toBe(400);
  expect(mocks.action).not.toHaveBeenCalled();
});
it.each([["UNAUTHORIZED",401],["FORBIDDEN",403],["VALIDATION",400]] as const)("preserves %s without returning any booking data", async (code, status) => {
  mocks.action.mockRejectedValue(new AppError(code, "private diagnostic"));
  const response = await GET(new Request("https://example.test/api/bookings/month?year=2026&month=10&storeId=s"));
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("private diagnostic");
});
it("does not leak database exceptions", async () => {
  mocks.action.mockRejectedValue(new Error("private database error"));
  const response = await GET(new Request("https://example.test/api/bookings/month?year=2026&month=10&storeId=s"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database error");
});
