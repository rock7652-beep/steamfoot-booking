import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: vi.fn() }));
import { readBookingDetail, updateBookingStatus, markBookingNoShow, collectBookingTrialPayment, correctBookingTrialCollection } from "@/lib/booking-client-transport";
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

it("does not retry uncertain no-show or collection writes", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(markBookingNoShow("b", "DEDUCTED_WITH_MAKEUP")).rejects.toThrow("待確認");
  await expect(collectBookingTrialPayment({ bookingId: "b", paymentMethod: "CASH" })).rejects.toThrow("待確認");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ bookingId: "b", operation: "no-show", choice: "DEDUCTED_WITH_MAKEUP" });
});

const correction = { bookingId: "b", originalTransactionId: "old", paymentMethod: "CASH" as const, amount: 400, reason: "誤收" };
it("submits correction once and preserves partial failure for reconciliation", async () => {
  const result = { success: false, error: "原收款已作廢，但新收款建立失敗" };
  const fetch = vi.fn().mockResolvedValue(Response.json(result));
  vi.stubGlobal("fetch", fetch);
  expect(await correctBookingTrialCollection(correction)).toEqual(result);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/bookings/trial-correction", expect.objectContaining({ method: "POST", body: JSON.stringify(correction) }));
});
it("does not replay an uncertain correction or accept a missing new transaction", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ success: true, data: {} }));
  vi.stubGlobal("fetch", fetch);
  await expect(correctBookingTrialCollection(correction)).rejects.toThrow("待確認");
  await expect(correctBookingTrialCollection(correction)).rejects.toThrow("待確認");
  expect(fetch).toHaveBeenCalledTimes(2);
});
