import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: mocks.detail }));
import { GET } from "@/app/api/bookings/detail/route";
import { AppError } from "@/lib/errors";
beforeEach(() => vi.resetAllMocks());
it("requires read permission before disclosing detail", async () => {
  mocks.permission.mockRejectedValue(new AppError("FORBIDDEN", "private"));
  const response = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b&storeId=s"));
  expect(mocks.permission).toHaveBeenCalledWith("booking.read");
  expect(response.status).toBe(403);
  expect(mocks.detail).not.toHaveBeenCalled();
});
it("requires explicit scope and retains scoped service authorization", async () => {
  const missing = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b"));
  expect(missing.status).toBe(400);
  expect(mocks.detail).not.toHaveBeenCalled();
  mocks.detail.mockResolvedValue({ booking: { id: "b" } });
  const response = await GET(new Request("https://example.com/api/bookings/detail?bookingId=b&storeId=s"));
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith("b", "s");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ booking: { id: "b" } });
});
