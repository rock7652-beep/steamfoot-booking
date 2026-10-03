import { beforeEach, expect, it, vi } from "vitest";
import { emptyTrialApplication } from "@/lib/trial-application";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permission: vi.fn(),
  find: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: mocks.permission }));
vi.mock("@/lib/db", () => ({
  prisma: { trialApplication: { findUnique: mocks.find } },
}));
vi.mock("@/server/services/trial-application-access", () => ({
  trialApplicationDatabaseAllowed: mocks.allowed,
}));
import { GET } from "@/app/api/trial-applications/[id]/attachments/[index]/route";
const params = Promise.resolve({
  id: "87a6e770-19de-4ca2-a705-f2b0a229f2e7",
  index: "0",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ role: "ADMIN", staffId: null });
  mocks.permission.mockResolvedValue(true);
  mocks.allowed.mockReturnValue(true);
  mocks.find.mockResolvedValue({
    payload: {
      ...emptyTrialApplication,
      storeName: "測試",
      contactName: "聯絡人",
      phone: "0912345678",
      email: "test@example.invalid",
      attachments: [
        { name: "課表.pdf", type: "pdf", content: btoa("%PDF-1.7 test") },
      ],
    },
  });
});
it.each([null, { role: "OWNER" }])(
  "blocks unauthenticated and non-HQ users before fetching",
  async (user) => {
    mocks.user.mockResolvedValue(user);
    expect(
      (await GET(new Request("https://example.com"), { params })).status,
    ).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
  },
);
it("blocks unsafe preview database", async () => {
  mocks.allowed.mockReturnValue(false);
  expect(
    (await GET(new Request("https://example.com"), { params })).status,
  ).toBe(503);
  expect(mocks.find).not.toHaveBeenCalled();
});
it("downloads authorized bytes without inline rendering or caching", async () => {
  const response = await GET(new Request("https://example.com"), { params });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).toBe("%PDF-1.7 test");
});
it("returns 404 for out of range file indices", async () => {
  expect(
    (
      await GET(new Request("https://example.com"), {
        params: Promise.resolve({
          id: "87a6e770-19de-4ca2-a705-f2b0a229f2e7",
          index: "3",
        }),
      })
    ).status,
  ).toBe(404);
  expect(mocks.find).not.toHaveBeenCalled();
});
