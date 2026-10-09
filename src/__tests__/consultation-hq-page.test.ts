import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), storeView: vi.fn(), permission: vi.fn(), allowed: vi.fn(), leads: vi.fn(), applications: vi.fn(), legacyCount: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { consultationLead: { count: m.legacyCount } } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/hq-store-view", () => ({ isHqStoreView: m.storeView }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/server/services/trial-application-access", () => ({ trialApplicationDatabaseAllowed: m.allowed }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
vi.mock("@/app/hq/dashboard/trial-applications/consultation-list", () => ({ ConsultationLeadList: (props: unknown) => { m.leads(props); return createElement("p", {}, "lead-list"); } }));
vi.mock("@/app/hq/dashboard/trial-applications/trial-application-list", () => ({ TrialApplicationsList: (props: unknown) => { m.applications(props); return createElement("p", {}, "formal-list"); } }));
import Page from "@/app/hq/dashboard/trial-applications/page";
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONSULTATION_HQ_ENABLED", "true");
  m.user.mockResolvedValue({ id: "admin", role: "ADMIN", staffId: null }); m.storeView.mockResolvedValue(false); m.permission.mockResolvedValue(true); m.allowed.mockReturnValue(true);
  m.legacyCount.mockResolvedValue(0);
});
describe("HQ unified consultation page", () => {
  it("shows actual historical import count without asserting all source rows were imported", async () => {
    expect(await render()).toContain("歷史 Sheet 尚未匯入 HQ");
    m.legacyCount.mockResolvedValue(4);
    const html = await render();
    expect(html).toContain("已匯入 4 筆歷史諮詢；其他來源請核對 Sheet");
    expect(html).not.toContain("歷史 Sheet 尚未匯入 HQ");
    expect(m.legacyCount).toHaveBeenCalledWith({ where: { sheetStatus: "LEGACY_IMPORTED" } });
  });
  it.each([null, { role: "OWNER", staffId: "owner" }, { role: "STAFF", staffId: "staff" }])("blocks non-HQ sessions before querying either list (%j)", async user => {
    m.user.mockResolvedValue(user); await expect(render()).rejects.toThrow("redirect:/hq/login"); expect(m.leads).not.toHaveBeenCalled(); expect(m.applications).not.toHaveBeenCalled();
  });
  it("does not expose HQ leads through selected-store view", async () => {
    m.storeView.mockResolvedValue(true); await expect(render()).rejects.toThrow("redirect:/hq/login"); expect(m.leads).not.toHaveBeenCalled(); expect(m.applications).not.toHaveBeenCalled();
  });
  it("requires staff.manage for the page", async () => {
    m.permission.mockResolvedValue(false); await expect(render()).rejects.toThrow("redirect:/hq/login"); expect(m.permission).toHaveBeenCalledWith("ADMIN", null, "staff.manage"); expect(m.leads).not.toHaveBeenCalled();
  });
  it("does not query a database if preview is unsafe", async () => {
    m.allowed.mockReturnValue(false); expect(await render()).toContain("預覽收件尚未連接獨立資料庫"); expect(m.leads).not.toHaveBeenCalled(); expect(m.applications).not.toHaveBeenCalled();
  });
  it("shows truthful disabled collection and historical Sheet notices without reading new tables", async () => {
    vi.stubEnv("CONSULTATION_HQ_ENABLED", "false"); const html = await render();
    expect(html).toContain("HQ 需求諮詢尚未啟用"); expect(html).toContain("歷史資料請核對原有 Sheet"); expect(html).toContain("1VHUCglOH0jRpWbdVAnIw39UVe7ULbag33JHs1Bw7oG4"); expect(m.leads).not.toHaveBeenCalled(); expect(m.legacyCount).not.toHaveBeenCalled();
    await render({ stage: "applications" }); expect(m.applications).toHaveBeenCalledOnce();
  });
  it("retains old ?application deep links and shares the bounded query across stages", async () => {
    const html = await render({ application: "app-id", q: "某店" });
    expect(m.applications).toHaveBeenCalledWith(expect.objectContaining({ application: "app-id", stage: "applications", q: "某店" }));
    expect(html).toContain("stage=consultations&amp;q="); expect(html).toContain("體驗版開通資料"); expect(m.leads).not.toHaveBeenCalled();
  });
  it("renders first-stage leads only when the explicit flag is true", async () => {
    expect(await render()).toContain("lead-list"); expect(m.leads).toHaveBeenCalledOnce(); expect(m.applications).not.toHaveBeenCalled();
  });
});
