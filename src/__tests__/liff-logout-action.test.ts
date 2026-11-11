import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), clear: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn(), signOut: mocks.signOut }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/store-resolver", () => ({ getStoreSlugById: vi.fn() }));
vi.mock("@/server/services/staff-login-audit", () => ({ recordStaffLogin: vi.fn() }));
vi.mock("@/server/auth/clear-store-context", () => ({ clearStoreContextCookies: mocks.clear }));
import { logoutAction } from "@/server/actions/auth";
beforeEach(() => vi.resetAllMocks());
function form() { const f = new FormData(); f.set("storeSlug", "zhubei"); f.set("logoutEntry", "liff"); return f; }
it("clears the server member session and targets a non-authenticating landing page", async () => {
  await logoutAction(form());
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/s/zhubei/liff/signed-out" });
  expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
});
it("preserves the framework redirect after successful logout", async () => {
  const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/s/zhubei/liff/signed-out;303;" });
  mocks.signOut.mockRejectedValue(redirect);
  await expect(logoutAction(form())).rejects.toBe(redirect);
  expect(mocks.clear).toHaveBeenCalledTimes(2);
});
it("does not report success when server sign-out fails", async () => {
  const failure = new Error("unavailable"); mocks.signOut.mockRejectedValue(failure);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(logoutAction(form())).rejects.toBe(failure);
  expect(mocks.clear).toHaveBeenCalledOnce(); spy.mockRestore();
});
it("does not accept a file or an external URL as the destination", async () => {
  const f = form(); f.set("storeSlug", new Blob(["zhubei"]), "store");
  await logoutAction(f);
  expect(mocks.signOut).toHaveBeenLastCalledWith({ redirectTo: "/hq/login" });
});
