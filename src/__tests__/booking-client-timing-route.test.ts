import { afterEach, expect, it, vi } from "vitest";
const permission = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissions", () => ({ requirePermission: permission }));
import { POST } from "@/app/api/bookings/client-timing/route";
const sample = { operation: "complete", outcome: "saved", responseMs: 400, committedMs: 420 };
const request = (body: unknown, origin = "https://example.test") => new Request("https://example.test/api/bookings/client-timing", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
afterEach(() => vi.restoreAllMocks());
it("logs only authenticated bounded metrics", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await POST(request(sample))).status).toBe(204);
  expect(log).toHaveBeenCalledWith("[BOOKING_CLIENT_PERF]", JSON.stringify(sample));
});
it("rejects extra private fields and foreign origins", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await POST(request({ ...sample, bookingId: "private" }))).status).toBe(400);
  expect((await POST(request(sample, "https://other.test"))).status).toBe(403);
  expect(log).not.toHaveBeenCalled();
});
it("does not log when permission is denied", async () => {
  permission.mockRejectedValueOnce(Error("denied"));
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await POST(request(sample))).status).toBe(403);
  expect(log).not.toHaveBeenCalled();
});
