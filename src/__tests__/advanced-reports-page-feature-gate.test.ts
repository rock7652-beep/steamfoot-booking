import { beforeEach, describe, expect, it, vi } from "vitest";
const { user, permission } = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import AdvancedReportsPage from "@/app/(dashboard)/dashboard/advanced-reports/page";
beforeEach(() => { user.mockResolvedValue({ role: "OWNER", staffId: "staff-1" }); permission.mockResolvedValue(true); });
describe("retired diagnosis route", () => {
  it("redirects authorized users to the entitlement-gated analysis page", async () => {
    await expect(AdvancedReportsPage()).rejects.toThrow("redirect:/dashboard/reports");
  });
  it("keeps report permission checks", async () => {
    permission.mockResolvedValue(false);
    await expect(AdvancedReportsPage()).rejects.toThrow("redirect:/dashboard");
  });
});
