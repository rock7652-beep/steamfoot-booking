import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: vi.fn(async () => ({ id: "s", name: "Store", shopConfig: { lineOfficialId: "@store" } })) },
  shopConfig: { findUnique: vi.fn(async () => ({ lineOfficialId: "@store" })) },
  storeMemberConnection: { findFirst: m.connection },
} }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u", role: "CUSTOMER" })) }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: vi.fn(async () => ({ storeId: "s", storeSlug: "store" })) }));
vi.mock("@/lib/store-line-config", () => ({ getConfiguredStoreLine: vi.fn(() => ({ basicId: "@store" })) }));
import MemberConnectPage from "@/app/member-connect/page";
import MemberLinkPage from "@/app/(customer)/member-link/page";
beforeEach(() => { vi.clearAllMocks(); m.connection.mockResolvedValue(null); });
it.each(["public", "member"])("does not mark notification setup complete from a Login approval at the %s entry", async entry => {
  const element = entry === "public" ? await MemberConnectPage({ searchParams: Promise.resolve({ store: "store" }) }) : await MemberLinkPage();
  const html = renderToStaticMarkup(element);
  expect(html).toContain("前往本店 LINE");
  expect(m.connection).toHaveBeenCalledWith({ where: { storeId: "s", centralUserId: "u", status: "APPROVED", channelKey: { not: { startsWith: "login:" } } }, select: { id: true } });
});
it("describes an actual notification approval without claiming Login success", async () => {
  m.connection.mockResolvedValue({ id: "oa-confirmation" });
  const html = renderToStaticMarkup(await MemberLinkPage());
  expect(html).toContain("本店 LINE 通知連結已確認");
  expect(html).toContain("會員登入需另外驗證");
});
