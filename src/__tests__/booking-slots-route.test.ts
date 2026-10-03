import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), slots: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/actions/slots", () => ({ fetchDaySlots: mocks.slots }));
import { GET } from "@/app/api/bookings/slots/route";
import { AppError } from "@/lib/errors";
beforeEach(() => vi.resetAllMocks());
it.each(["2026-02-30", "bad", "2026-13-01"])("rejects invalid date %s before querying", async date => {
  expect((await GET(new Request(`https://example.test/api/bookings/slots?date=${date}`))).status).toBe(400);
  expect(mocks.slots).not.toHaveBeenCalled();
});
it("checks read permission and delegates session-scoped slot rules", async () => {
  mocks.slots.mockResolvedValue({ slots: [] });
  const response = await GET(new Request("https://example.test/api/bookings/slots?date=2026-09-28&storeId=untrusted"));
  expect(mocks.permission).toHaveBeenCalledWith("booking.read");
  expect(mocks.slots).toHaveBeenCalledExactlyOnceWith("2026-09-28");
  expect(await response.json()).toEqual({ slots: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("denies access before reading slots", async () => {
  mocks.permission.mockRejectedValue(new AppError("FORBIDDEN", "private"));
  const response = await GET(new Request("https://example.test/api/bookings/slots?date=2026-09-28"));
  expect(response.status).toBe(403);
  expect(mocks.slots).not.toHaveBeenCalled();
});
