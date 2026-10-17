import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ customer: vi.fn(), requests: vi.fn(), grants: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  customer: { findFirst: m.customer }, storeMemberConnection: { findMany: m.requests }, lineRebindRequest: { findMany: m.grants },
} }));
import { readStoreMemberConnection } from "@/server/services/store-member-connection";
beforeEach(() => {
  vi.resetAllMocks();
  m.customer.mockResolvedValue({ userId: "u", identityLinks: [{ userId: "u" }], lineLinkStatus: "LINKED" });
  m.requests.mockResolvedValue([]); m.grants.mockResolvedValue([]);
});
it("does not infer successful login from existing membership", async () => {
  expect(await readStoreMemberConnection("s", "c")).toMatchObject({ membership: "已連結", login: "尚未驗證本次登入" });
});
it("never counts a Login approval as notification confirmation", async () => {
  m.requests.mockResolvedValue([{ id: "r", channelKey: "login:123", status: "APPROVED", expiresAt: new Date(Date.now() + 60_000) }]);
  m.grants.mockResolvedValue([{ status: "PENDING_CAPTURE", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) }]);
  expect(await readStoreMemberConnection("s", "c")).toMatchObject({ notification: "本店通知尚未確認", login: "已授權，等待顧客重新進入並完成登入" });
});
it("shows an expired grant as requiring a new submission and review", async () => {
  m.grants.mockResolvedValue([{ status: "PENDING_CAPTURE", consumedAt: null, expiresAt: new Date(0) }]);
  expect(await readStoreMemberConnection("s", "c")).toMatchObject({ login: "恢復申請已失效，請顧客重新提交並核對" });
});
it("reports consumed recovery as a restored link rather than proven session success", async () => {
  m.grants.mockResolvedValue([{ status: "CONSUMED", consumedAt: new Date(), expiresAt: new Date() }]);
  expect(await readStoreMemberConnection("s", "c")).toMatchObject({ login: "登入連結已恢復，尚需顧客確認實際登入" });
});
it("does not let an older consumed grant mask a newer expired login request", async () => {
  m.requests.mockResolvedValue([{ channelKey: "login:123", status: "PENDING", expiresAt: new Date(0) }]);
  m.grants.mockResolvedValue([{ status: "CONSUMED", consumedAt: new Date(0), expiresAt: new Date(0) }]);
  expect(await readStoreMemberConnection("s", "c")).toMatchObject({ login: "登入確認申請已過期，請顧客重新提交並核對" });
});
