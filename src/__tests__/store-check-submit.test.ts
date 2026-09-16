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
const fitness = { ...payload, formVersion: "fitness-v2", source: "fitness-intake", contactWay: "申請體驗帳號", needs: ["學員", "教練", "店務", "招生"], priorityNeed: "招生" };
describe("fitness v2 contract", () => {
  it("forwards every selected need when the receiver supports unlimited selections", async () => {
    const needs = Array.from({length: 19}, (_, index) => '困擾' + index);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ok: true, capabilities: ['fitness-v2', 'fitness-unlimited-needs']}))
      .mockResolvedValueOnce(Response.json({version: 2, ok: true, saved: true, requestId: payload.requestId}));
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request({...fitness, needs, priorityNeed: needs[0]}))).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[1][1].body).needs).toEqual(needs);
  });
  it("does not POST more than four selections to the old four-choice receiver", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ok: true, capabilities: ['fitness-v2']})); vi.stubGlobal('fetch', fetch);
    const response = await POST(request({...fitness, needs: ['1','2','3','4','5'], priorityNeed: '1'}));
    expect(response.status).toBe(503); expect(fetch).toHaveBeenCalledTimes(1);
    expect((await response.json()).code).toBe('RECEIVER_UPDATE_REQUIRED');
  });
  it("accepts four needs after checking receiver capability", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, capabilities: ["fitness-v2"] }))
      .mockResolvedValueOnce(Response.json({ version: 2, ok: true, saved: true, requestId: payload.requestId }));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request(fitness))).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ needs: fitness.needs, priorityNeed: "招生" });
  });
  it("strips contacts when only sharing needs", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, capabilities: ["fitness-v2"] }))
      .mockResolvedValueOnce(Response.json({ version: 2, ok: true, saved: true, requestId: payload.requestId }));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request({ ...fitness, contactWay: "目前暫不考慮" }))).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ contactName: "", phone: "", lineId: "", time: "" });
  });
  it("accepts an undecided applicant without contact details", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, capabilities: ["fitness-v2"] }))
      .mockResolvedValueOnce(Response.json({ version: 2, ok: true, saved: true, requestId: payload.requestId }));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request({ ...fitness, contactWay: "目前暫不考慮", contactName: "", lineId: "", needs: ["還不確定，想先聊聊"], priorityNeed: "" }))).status).toBe(200);
  });
  it.each([
    { ...fitness, priorityNeed: "未選的項目" },
    { ...fitness, priorityNeed: "" },
    { ...fitness, needs: ["還不確定，想先聊聊", "學員"] },
    { ...fitness, lineId: "" },
    { ...fitness, contactName: "" },
    { ...fitness, source: "direct" },
    { ...fitness, contactWay: "unknown" },
    { ...payload, needs: ["1", "2", "3", "4"] },
    { ...payload, contactWay: "目前暫不考慮", contactName: "", lineId: "" },
  ])("rejects invalid or legacy-incompatible data before forwarding", async data => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request(data))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never POSTs to an old receiver and returns a safe retry response", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, version: 2 })); vi.stubGlobal("fetch", fetch);
    const result = await POST(request(fitness));
    expect(result.status).toBe(503); expect((await result.json()).code).toBe("RECEIVER_UPDATE_REQUIRED");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });
});
describe("store check save acknowledgement", () => {
  it("forwards booking style into existing notes without losing free text", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request({ ...payload, bookingMode: "不確定，希望協助判斷", otherNeed: "需要排班" }))).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body).otherNeed).toBe("預約方式：不確定，希望協助判斷\n需要排班");
  });
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
