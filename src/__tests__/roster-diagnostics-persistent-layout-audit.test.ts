// @vitest-environment jsdom
/** Source-level characterization: Next preserves server-layout props on soft
 * navigation. This exercises the real Next segment boundary with those preserved
 * props; it is not a browser/router integration test or a live-crash reproduction. */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundaryHandler } from "next/dist/client/components/error-boundary";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { allowModuleRosterPreviewDiagnostics } from "@/lib/module-roster-preview-diagnostics";
import { RosterPreviewDiagnosticsProvider } from "@/components/admin/roster-preview-diagnostics";
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
const route = vi.hoisted(() => ({ pathname: "/s/staging/admin/dashboard/bookings" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
import DashboardError from "@/app/(dashboard)/error";

const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/unify-module-notes-density",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  DIRECT_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
};
const bookingsPath = "/s/staging/admin/dashboard/bookings";
const otherPath = "/s/staging/admin/dashboard/customers";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
  route.pathname = bookingsPath;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function ThrowIfRequested({ fail }: { fail: boolean }) {
  if (fail) throw new Error("Maximum update depth exceeded: synthetic-only");
  return createElement("p", null, "synthetic route content");
}
const serverEligible = allowModuleRosterPreviewDiagnostics(env, { role: "ADMIN", storeId: "staging-store" });
async function renderPreservedLayout(currentPath: string | null, fail = false, enabled = serverEligible) {
  // Server eligibility stays constant while the real provider receives changes
  // through usePathname, just as in a preserved Next layout.
  route.pathname = currentPath;
  await act(async () => root.render(createElement(RosterPreviewDiagnosticsProvider, { enabled },
    createElement(ErrorBoundaryHandler, { pathname: currentPath, errorComponent: DashboardError },
      createElement(ThrowIfRequested, { fail })))));
}
it("lets the real segment fallback consume a provider declared in its parent layout", async () => {
  await renderPreservedLayout(bookingsPath, true);
  expect(host.textContent).toContain("隔離名單驗收碼：UPDATE_DEPTH");
});
it("enables the code after other-page entry followed by soft navigation into bookings", async () => {
  await renderPreservedLayout(otherPath);
  await renderPreservedLayout(bookingsPath, true);
  expect(host.textContent).toContain("隔離名單驗收碼：UPDATE_DEPTH");
});
it("disables the code on other-page errors after initial bookings entry", async () => {
  await renderPreservedLayout(bookingsPath);
  await renderPreservedLayout(otherPath, true);
  expect(host.textContent).toContain("發生錯誤");
  expect(host.textContent).not.toContain("隔離名單驗收碼");
});
it.each([null, "/dashboard/bookings", "/s/other/admin/dashboard/bookings", "/s/staging/admin/dashboard/bookings/new"])("denies a nonexact or missing live pathname: %s", async pathname => {
  await renderPreservedLayout(pathname, true);
  expect(host.textContent).not.toContain("隔離名單驗收碼");
});
it.each([
  allowModuleRosterPreviewDiagnostics({ ...env, VERCEL_ENV: "production" }, { role: "ADMIN", storeId: "staging-store" }),
  allowModuleRosterPreviewDiagnostics(env, { role: "OWNER", storeId: "staging-store" }),
  allowModuleRosterPreviewDiagnostics(env, { role: "ADMIN", storeId: "other-store" }),
  false,
])("denies diagnostics on the exact route without server eligibility: %s", async enabled => {
  expect(enabled).toBe(false);
  await renderPreservedLayout(bookingsPath, true, enabled);
  expect(host.textContent).not.toContain("隔離名單驗收碼");
});
it("defaults to no diagnostic when no provider exists", async () => {
  await act(async () => root.render(createElement(ErrorBoundaryHandler, { pathname: bookingsPath, errorComponent: DashboardError },
    createElement(ThrowIfRequested, { fail: true }))));
  expect(host.textContent).not.toContain("隔離名單驗收碼");
});
it("does not let a segment boundary catch an ancestor-layout exception", async () => {
  function BrokenLayout({ children }: { children?: ReactNode }): never {
    void children;
    throw new Error("synthetic layout-level failure");
  }
  function OuterFallback() { return createElement("p", null, "outer root fallback"); }
  await act(async () => root.render(createElement(ErrorBoundaryHandler, { pathname: bookingsPath, errorComponent: OuterFallback },
    createElement(BrokenLayout, null,
      createElement(RosterPreviewDiagnosticsProvider, { enabled: true },
        createElement(ErrorBoundaryHandler, { pathname: bookingsPath, errorComponent: DashboardError },
          createElement("p", null, "synthetic route content")))))));
  expect(host.textContent).toBe("outer root fallback");
});
