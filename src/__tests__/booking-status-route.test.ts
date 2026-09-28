import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), revert: vi.fn(), noShow: vi.fn() }));
vi.mock("@/server/actions/booking", () => ({ markCompleted: mocks.complete, revertBookingStatus: mocks.revert, markNoShow: mocks.noShow }));
vi.mock("@/lib/booking-route-mutation", () => ({ withBookingRouteMutation: (work: () => Promise<unknown>) => work() }));
import { POST } from "@/app/api/bookings/status/route";
function request(body: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/bookings/status", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => vi.resetAllMocks());
it("rejects cross-origin writes before calling any mutation", async () => {
  expect((await POST(request({ bookingId: "b", operation: "complete" }, "https://evil.test"))).status).toBe(403);
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("rejects invalid operations", async () => {
  expect((await POST(request({ bookingId: "b", operation: "delete" }))).status).toBe(400);
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("delegates restore to the guarded action and preserves rejection", async () => {
  mocks.revert.mockResolvedValue({ success: false, error: "FORBIDDEN" });
  const response = await POST(request({ bookingId: "b", operation: "revert" }));
  expect(mocks.revert).toHaveBeenCalledExactlyOnceWith("b");
  expect(await response.json()).toEqual({ success: false, error: "FORBIDDEN" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns an uncertain response on an exception without retrying", async () => {
  mocks.complete.mockRejectedValue(Error("private database details"));
  const response = await POST(request({ bookingId: "b", operation: "complete" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database details");
  expect(mocks.complete).toHaveBeenCalledTimes(1);
});

it.each(["DEDUCTED", "DEDUCTED_WITH_MAKEUP"])("preserves no-show choice %s through the guarded action", async choice => {
  mocks.noShow.mockResolvedValue({ success: true });
  expect((await POST(request({ bookingId: "b", operation: "no-show", choice }))).status).toBe(200);
  expect(mocks.noShow).toHaveBeenCalledExactlyOnceWith("b", choice);
});
it("rejects unsupported no-show policies before mutation", async () => {
  expect((await POST(request({ bookingId: "b", operation: "no-show", choice: "NOT_DEDUCTED" }))).status).toBe(400);
  expect(mocks.noShow).not.toHaveBeenCalled();
});
