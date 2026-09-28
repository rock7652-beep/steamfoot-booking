import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: vi.fn() }));
import { readBookingDetail, updateBookingStatus } from "@/lib/booking-client-transport";
afterEach(() => vi.unstubAllGlobals());
it("does not replay an uncertain write", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(updateBookingStatus("b", "complete")).rejects.toThrow("待確認");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves definitive business rejection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false, error: "denied" })));
  expect(await updateBookingStatus("b", "revert")).toEqual({ success: false, error: "denied" });
});
it("reads explicit store detail independently and rejects a mismatched booking", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ booking: { id: "other" } }));
  vi.stubGlobal("fetch", fetch);
  await expect(readBookingDetail("b", "s")).rejects.toThrow("不符");
  expect(fetch).toHaveBeenCalledWith("/api/bookings/detail?bookingId=b&storeId=s", { cache: "no-store", credentials: "same-origin" });
});
