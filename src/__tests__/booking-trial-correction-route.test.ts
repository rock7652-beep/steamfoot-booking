import { beforeEach, expect, it, vi } from "vitest";
const collect = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/trial-booking", () => ({ correctTrialCollection: collect }));
vi.mock("@/lib/booking-route-mutation", () => ({ withBookingRouteMutation: (work: () => Promise<unknown>) => work() }));
import { POST } from "@/app/api/bookings/trial-correction/route";
const input = { bookingId: "b", originalTransactionId: "old", paymentMethod: "CASH", amount: 400, reason: "更正金額" };
const request = (body: unknown, origin = "https://example.test") => new Request("https://example.test/api/bookings/trial-correction", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
it("rejects foreign origins and invalid amounts without writing", async () => {
  expect((await POST(request(input, "https://other.test"))).status).toBe(403);
  expect((await POST(request({ ...input, amount: -1 }))).status).toBe(400);
  expect((await POST(request({ ...input, reason: "" }))).status).toBe(400);
  expect(collect).not.toHaveBeenCalled();
});
it("delegates void and recollection together and preserves its authoritative result", async () => {
  const result = { success: true, data: { transactionId: "t" } };
  collect.mockResolvedValue(result);
  const response = await POST(request(input));
  expect(collect).toHaveBeenCalledExactlyOnceWith(input);
  expect(await response.json()).toEqual(result);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves rejection and does not replay an uncertain collection", async () => {
  collect.mockResolvedValueOnce({ success: false, error: "原收款已作廢，但新收款建立失敗" });
  expect(await (await POST(request(input))).json()).toEqual({ success: false, error: "原收款已作廢，但新收款建立失敗" });
  collect.mockRejectedValueOnce(Error("private database detail"));
  const response = await POST(request(input));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database detail");
  expect(collect).toHaveBeenCalledTimes(2);
});
