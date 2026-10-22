import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const m = vi.hoisted(() => ({ native: vi.fn(), opening: vi.fn(), create: vi.fn(), customer: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ role: "OWNER", storeId: "native-store" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: async () => true }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "native-store" }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: async () => {} }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: async () => null }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: () => ({}) }));
vi.mock("@/server/services/music-data-scope", () => ({ musicCustomerWhere: () => ({}), musicDataSeparationEnabled: () => false, musicDataScope: () => "operational" }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: m.customer }, storeFeatureEntitlement: { findFirst: async () => ({ storeId: "native-store" }) } } }));
vi.mock("@/server/queries/music-leave-workspace", () => ({ getMusicLeaveWorkspace: m.native }));
vi.mock("@/server/queries/music-opening-makeup", () => ({ getOpeningMakeupWorkspace: m.opening }));
vi.mock("@/server/actions/course-members", () => ({ createCourseBooking: m.create }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, useSearchParams: () => new URLSearchParams(), usePathname: () => "/dashboard/courses/makeups", useRouter: () => ({ refresh() {} }) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children, ...props }: { children: React.ReactNode }) => createElement("a", props, children) }));
import MusicMakeupsPage from "@/app/(dashboard)/dashboard/courses/makeups/page";
beforeEach(() => {
  vi.clearAllMocks(); m.customer.mockResolvedValue([{ id: "native-learner", name: "示範學員" }]);
  m.native.mockResolvedValue({ truncated: false, sessionsTruncated: false, rows: [{ id: "leave", customerId: "native-learner", customerName: "示範學員", name: "鋼琴個別課", date: "2026-10-15T02:00:00Z", sourceDate: "2026-10-15", sourceSessionId: "original", cardId: "native-makeup", separate: true, state: "待安排", issue: null, expiry: "2026-12-31T15:59:59Z", booking: null, sessions: [] }] });
});
it("keeps native makeup actions and return context without loading historical rights", async () => {
  const html = renderToStaticMarkup(await MusicMakeupsPage({ searchParams: Promise.resolve({ customerId: "native-learner", returnQuery: "search=piano&page=2" }) }));
  expect(html).toContain("請假更多操作"); expect(html).toContain("原堂已扣・另給補課"); expect(html).toContain("返回學員");
  expect(html).not.toContain("音教雲"); expect(html).not.toContain("opening-makeups");
  expect(m.opening).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  expect(m.native).toHaveBeenCalledWith("native-store", [{ id: "native-learner", name: "示範學員" }], undefined);
  if (process.env.MUSIC_REMOVAL_PREVIEW_DIR) {
    const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
    const { compile } = await import("@tailwindcss/node");
    const { Scanner } = await import("@tailwindcss/oxide");
    const css = await compile(readFileSync("src/app/globals.css", "utf8"), { base: `${process.cwd()}/src/app`, onDependency() {} });
    const scanner = new Scanner({ sources: [{ base: process.cwd(), pattern: "src/**/*.tsx", negated: false }] });
    const dir = process.env.MUSIC_REMOVAL_PREVIEW_DIR; mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/index.html`, `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.build(scanner.scan())}</style><body style="padding:24px;background:#faf8f4"><main style="max-width:1400px;margin:auto">${html}<p style="margin-top:24px;color:#71675d;font-size:14px">介面預覽：示範資料，未連接真實帳務。</p></main></body></html>`);
  }
});
it("retains a clear empty state with no historical fallback", async () => {
  m.native.mockResolvedValue({ rows: [], truncated: false, sessionsTruncated: false });
  const html = renderToStaticMarkup(await MusicMakeupsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("沒有符合條件的紀錄"); expect(m.opening).not.toHaveBeenCalled();
});
