// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LIFF_MEMBER_SESSION_EXPIRED } from "@/lib/liff/session-events";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  member: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("@/lib/liff/client", () => ({
  initLiff: mocks.init,
  isInLineClient: () => true,
  getIDToken: () => "current-token",
}));
vi.mock("@/lib/liff/session-refresh", () => ({
  currentVerifiedLiffCustomer: mocks.member,
  hasVerifiedLiffTokenChanged: () => false,
  refreshLiffSession: mocks.refresh,
}));

import { CustomerSessionResume } from "@/components/customer-session-resume";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  host = document.createElement("div");
  root = createRoot(host);
  mocks.init.mockResolvedValue({});
  mocks.member.mockReturnValue("same-member");
  mocks.refresh.mockResolvedValue({ status: "session_created" });
});

afterEach(async () => {
  await act(async () => root.unmount());
  Reflect.deleteProperty(document, "hidden");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(channel: "web" | "line", path: string) {
  window.history.replaceState(null, "", path);
  const identity = channel === "web"
    ? { channel, userId: "same-account" } as const
    : { channel, liffId: "shared-app" } as const;
  await act(async () => {
    root.render(createElement(
      CustomerSessionResume,
      { ...identity, storeSlug: "warm" },
      createElement("input", { defaultValue: "原本的預約草稿" }),
    ));
  });
  return host.querySelector("input")!;
}

async function returnAfterIdle() {
  vi.setSystemTime(16 * 60_000);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

it("checks a stale LINE view once and retains the same member's draft", async () => {
  const input = await render("line", "/s/warm/liff/member-booking");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(mocks.refresh).not.toHaveBeenCalled();

  let finish = () => {};
  mocks.refresh.mockReturnValue(new Promise((resolve) => {
    finish = () => resolve({ status: "session_created" });
  }));
  await returnAfterIdle();
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith({ idToken: "current-token", storeSlug: "warm" }, undefined, expect.any(AbortSignal));
  expect(input.closest("[hidden]")).not.toBeNull();
  expect(host.textContent).toContain("正在確認會員身分");
  await act(async () => finish());
  expect(host.querySelector("input")).toBe(input);
  expect(input.closest("[hidden]")).toBeNull();
});

it("provides a store and page scoped reopen action for an expired LINE entry", async () => {
  const input = await render("line", "/s/warm/liff/wallets?tab=active");
  await act(async () => window.dispatchEvent(new CustomEvent(LIFF_MEMBER_SESSION_EXPIRED, { detail: "warm" })));
  expect(input.closest("[hidden]")).not.toBeNull();
  const reopen = new URL(host.querySelector("a")!.href);
  expect(reopen.hostname).toBe("liff.line.me");
  expect(reopen.searchParams.get("next")).toBe("/s/warm/liff/wallets?tab=active");
});

it("retains the web return path when the session is gone", async () => {
  mocks.fetch.mockResolvedValue(Response.json(null));
  const input = await render("web", "/s/warm/beauty?view=book#time");
  await returnAfterIdle();
  expect(input.closest("[hidden]")).not.toBeNull();
  const login = new URL(host.querySelector("a")!.href);
  expect(login.pathname).toBe("/s/warm/");
  expect(login.searchParams.get("returnTo")).toBe("/s/warm/beauty?view=book#time");
});

it("allows a network retry without exposing member information", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({
    user: { id: "same-account", role: "CUSTOMER" },
  }));
  const input = await render("web", "/s/warm/my-bookings");
  await returnAfterIdle();
  expect(input.closest("[hidden]")).not.toBeNull();
  expect(host.textContent).toContain("暫時無法確認");
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("input")).toBe(input);
  expect(input.closest("[hidden]")).toBeNull();
});

it.each([
  "/s/warm/liff/public-trial",
  "/s/warm/liff?liff.state=%2Fpublic-trial",
])("leaves public trial forms available after inactivity at %s", async (path) => {
  const input = await render("line", path);
  await returnAfterIdle();
  expect(input.closest("[hidden]")).toBeNull();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
