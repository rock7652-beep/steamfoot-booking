import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), claim: vi.fn(), mark: vi.fn(), session: vi.fn(), permission: vi.fn() }));
vi.mock("@/server/services/consultation-lead-intake", () => ({
  saveConsultationLead: m.save, claimConsultationDelivery: m.claim, markConsultationDelivery: m.mark,
  ConsultationRequestConflictError: class ConsultationRequestConflictError extends Error {},
}));
vi.mock("@/lib/session", () => ({ requireAdminSession: m.session }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
import { POST } from "@/app/pricing/submit/route";
import { ConsultationRequestConflictError } from "@/server/services/consultation-lead-intake";
const data = { requestId: "f2170225-17f8-4ad7-8031-f305afba256f", storeName: "虛構測試店", contactName: "測試", industry: "服務", lineId: "TEST-NOT-A-CONTACT", needs: ["預約"], replaceReason: [] };
const req = (payload = data) => new Request("https://www.steamfoot.com/pricing/submit", { method: "POST", headers: { origin: "https://www.steamfoot.com" }, body: JSON.stringify(payload) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONSULTATION_HQ_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "production");
  m.save.mockResolvedValue({ lead: { id: "lead-test", sheetStatus: "PENDING" }, created: true });
  m.claim.mockResolvedValue(true); m.mark.mockResolvedValue(true);
  m.session.mockResolvedValue({id:"test-admin",role:"ADMIN"}); m.permission.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("two-stage consultation intake", () => {
  it("confirms HQ first and exactly one Sheet post with supplied links kept in old notes", async () => {
    const fetch = vi.fn().mockImplementation(async () => { expect(m.save).toHaveBeenCalledOnce(); expect(m.claim).toHaveBeenCalledOnce(); return Response.json({version: 2, ok: true, saved: true, requestId: data.requestId}); });
    vi.stubGlobal("fetch", fetch);
    const links = { websiteUrl: "https://example.com/shop", facebookUrl: "https://www.facebook.com/example", instagramUrl: "https://www.instagram.com/example" };
    const response = await POST(req({...data, ...links, otherNeed: "原始需求"} as typeof data));
    expect(await response.json()).toMatchObject({ saved: true, hqSaved: true, sheetStatus: "CONFIRMED" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ...links, otherNeed: "原始需求" }), undefined);
    const sheetPayload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sheetPayload.otherNeed).toBe("店家官網：https://example.com/shop\nFacebook：https://www.facebook.com/example\nInstagram：https://www.instagram.com/example\n原始需求");
    for (const name of Object.keys(links)) expect(sheetPayload).not.toHaveProperty(name);
    expect(m.mark).toHaveBeenCalledWith("lead-test", "CONFIRMED");
  });
  it("keeps a durable HQ receipt when Sheet result is uncertain without retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", fetch);
    const response = await POST(req());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({saved:true,hqSaved:true,sheetStatus:"UNKNOWN"});
    expect(fetch).toHaveBeenCalledOnce(); expect(m.mark).toHaveBeenCalledWith("lead-test", "UNKNOWN");
  });
  it("keeps a durable receipt even if recording Sheet failure also fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout"))); m.mark.mockRejectedValue(new Error("db offline"));
    expect(await (await POST(req())).json()).toMatchObject({saved:true,hqSaved:true,sheetStatus:"UNKNOWN"});
  });
  it.each(["SENDING", "UNKNOWN", "CONFIRMED", "LEGACY_IMPORTED"])("never forwards a retried %s submission", async sheetStatus => {
    m.save.mockResolvedValue({lead:{id:"lead-test",sheetStatus},created:false}); m.claim.mockResolvedValue(false);
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect(await (await POST(req())).json()).toMatchObject({saved:true,sheetStatus:["CONFIRMED","LEGACY_IMPORTED"].includes(sheetStatus)?sheetStatus:"UNKNOWN"});
    expect(fetch).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled(); expect(m.mark).not.toHaveBeenCalled();
  });
  it("rejects changed content reusing an id without posting", async () => {
    m.save.mockRejectedValue(new ConsultationRequestConflictError()); const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(req())).status).toBe(409); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not forward or claim success when initial HQ save fails", async () => {
    m.save.mockRejectedValue(new Error("db unavailable")); const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(req())).status).toBe(502); expect(fetch).not.toHaveBeenCalled();
  });
  it("returns a known fitness receipt even when external readiness is unavailable", async () => {
    m.save.mockResolvedValue({lead:{id:"lead-test",sheetStatus:"CONFIRMED"},created:false});
    const fetch=vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch",fetch);
    const fitness={...data,formVersion:"fitness-v2",source:"fitness-intake",contactWay:"申請體驗帳號",priorityNeed:"預約"};
    expect(await (await POST(req(fitness))).json()).toMatchObject({saved:true,sheetStatus:"CONFIRMED"});
    expect(fetch).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  });
  it("durably saves fitness needs but leaves Sheet unattempted when its contract is unavailable", async () => {
    const fetch=vi.fn().mockResolvedValue(Response.json({ok:true,capabilities:[]})); vi.stubGlobal("fetch",fetch);
    const fitness={...data,formVersion:"fitness-v2",source:"fitness-intake",contactWay:"申請體驗帳號",priorityNeed:"預約"};
    expect(await (await POST(req(fitness))).json()).toMatchObject({saved:true,hqSaved:true,sheetStatus:"PENDING"});
    expect(fetch).toHaveBeenCalledOnce(); expect(m.claim).not.toHaveBeenCalled(); expect(m.mark).not.toHaveBeenCalled();
  });
  it("preserves Sheet-only flow with rollout disabled and does not touch HQ", async () => {
    vi.stubEnv("CONSULTATION_HQ_ENABLED", "false"); vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({ok:true})));
    expect(await (await POST(req())).json()).toEqual({ok:true,saved:true,requestId:data.requestId}); expect(m.save).not.toHaveBeenCalled();
  });
  function isolatedPreview() {
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres");
    m.save.mockResolvedValue({lead:{id:"lead-test",sheetStatus:"NOT_SENT_PREVIEW"},created:true});
  }
  it("permits only authenticated HQ synthetic Preview receipt with all external effects blocked", async () => {
    isolatedPreview(); const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const payload={...data,storeName:"【HQ測試】虛構店",formVersion:"fitness-v2",source:"fitness-intake",contactWay:"申請體驗帳號",priorityNeed:"預約"};
    expect(await (await POST(req(payload))).json()).toMatchObject({saved:true,hqSaved:true,sheetStatus:"NOT_SENT_PREVIEW"});
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({storeName:payload.storeName}),{previewOnly:true});
    expect(m.permission).toHaveBeenCalledWith("staff.manage");
    expect(fetch).not.toHaveBeenCalled();expect(m.claim).not.toHaveBeenCalled();expect(m.mark).not.toHaveBeenCalled();
  });
  it.each(["unauthenticated","owner","permission"])("blocks %s Preview injection before persistence", async mode => {
    isolatedPreview();const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    if(mode==="unauthenticated")m.session.mockRejectedValue(new Error("no session"));
    if(mode==="owner")m.session.mockResolvedValue({id:"owner",role:"OWNER"});
    if(mode==="permission")m.permission.mockRejectedValue(new Error("denied"));
    expect((await POST(req({...data,storeName:"【HQ測試】虛構店"}))).status).toBe(403);
    expect(m.save).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unmarked Preview data and unsafe database overrides before auth/database reads",async()=>{
    isolatedPreview();const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(req())).status).toBe(400);expect(m.session).not.toHaveBeenCalled();
    vi.stubEnv("DATABASE_URL","postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres?host=other.example");
    expect((await POST(req({...data,storeName:"【HQ測試】虛構店"}))).status).toBe(503);
    expect(m.session).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined,"production","unknown"])("rejects a Preview flag in non-Preview context %s before effects",async env=>{
    vi.stubEnv("VERCEL_ENV",env);vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED","true");
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(req())).status).toBe(503);expect(fetch).not.toHaveBeenCalled();expect(m.session).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
  });
  it("blocks preview before any database or external delivery", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(req())).status).toBe(503); expect(fetch).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  });
});
