import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/s/lubymusic/admin/dashboard/courses" }));
vi.mock("@/components/app-link", () => ({ AppLink: () => null }));
import { resolveDashboardHref } from "@/components/dashboard-link";
it("keeps the music entitlement entry inside its authorized store prefix", () => {
  const page = readFileSync("src/app/(dashboard)/dashboard/courses/page.tsx", "utf8");
  expect(page).toContain('<DashboardLink href="/dashboard/courses/opening-makeups"');
  expect(page).not.toContain('<a href="/dashboard/courses/opening-makeups"');
  expect(resolveDashboardHref("/dashboard/courses/opening-makeups", "/s/lubymusic/admin/dashboard/courses")).toBe("/s/lubymusic/admin/dashboard/courses/opening-makeups");
  expect(resolveDashboardHref("/dashboard/courses/opening-makeups", "/hq/dashboard/courses")).toBe("/hq/dashboard/courses/opening-makeups");
});
