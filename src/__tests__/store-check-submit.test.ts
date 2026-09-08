import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/pricing/submit/route";

const payload = {
  requestId: "f2170225-17f8-4ad7-8031-f305afba256f", storeName: "測試店家",
  contactName: "系統測試", industry: "服務業", lineId: "TEST-DO-NOT-CONTACT",
  needs: ["預約與時段管理"], replaceReason: [],
};
function request(body: object = payload, origin = "https://www.steamfoot.com") {
  return new Request("https://www.steamfoot.com/pricing/submit", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("store check save acknowledgement", () => {
  it.each([
    { ok: true },
    { version: 2, ok: true, saved: true, requestId: payload.requestId, notification: "sent" },
  ])("accepts an explicit save acknowledgement: %j", async (result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: true, requestId: payload.requestId });
  });
  it.each([
    { ok: false }, { ok: "true" }, { ok: true, saved: false },
    { version: 2, ok: true, saved: false, requestId: payload.requestId },
    { version: 2, ok: true, saved: true, requestId: "another-submission" },
    { version: 3, ok: true, saved: true, requestId: payload.requestId },
  ])("never shows success for an unconfirmed save: %j", async (result) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: "SAVE_UNCONFIRMED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps a saved application successful when email fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ version: 2, ok: true, saved: true, requestId: payload.requestId, notification: "failed" })));
    const response = await POST(request());
    expect((await response.json()).saved).toBe(true);
  });
  it.each([new Response("<html>login</html>"), new Response("down", { status: 503 })])("rejects HTML or HTTP errors", async (upstream) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));
    expect((await POST(request())).status).toBe(502);
  });
  it("does not retry an uncertain network failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request())).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects missing contact, oversized fields and cross-origin requests before forwarding", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request({ ...payload, lineId: "" }))).status).toBe(400);
    expect((await POST(request({ ...payload, otherNeed: "a".repeat(24001) }))).status).toBe(400);
    expect((await POST(request(payload, "https://other.example"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
