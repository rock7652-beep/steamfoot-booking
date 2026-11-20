// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  token: vi.fn(),
  exchange: vi.fn(),
  fetchBookings: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/liff/client", () => ({
  initLiff: mocks.init,
  isInLineClient: () => true,
  getIDToken: mocks.token,
}));
vi.mock("@/lib/liff/session-refresh", () => ({ refreshLiffSession: mocks.exchange }));
vi.mock("@/lib/liff/profile-loader", () => ({ loadProfileWithSessionRefresh: vi.fn() }));
vi.mock("@/server/actions/liff-my-bookings", () => ({ fetchLiffBookings: mocks.fetchBookings }));
vi.mock("@/server/actions/liff-cancel-booking", () => ({ cancelLiffBooking: vi.fn() }));

import { BookingsList } from "@/app/(liff)/liff/bookings/bookings-list";

async function render(returnStoreSlug?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); };
  await act(async () => root.render(createElement(BookingsList, {
    storeSlug: "entry-store",
    storeName: "測試門市",
    liffId: "shared-app",
    contactUrl: "",
    storeAddress: "",
    storeMapUrl: "",
    dataSource: "steamfoot",
    returnStoreSlug,
  })));
  return host;
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("offers the official LINE reentry link and never reads bookings without a token", async () => {
  mocks.token.mockReturnValue(null);
  const host = await render();
  const reentry = host.querySelector('a[href^="https://liff.line.me/"]');
  expect(reentry?.textContent).toBe("重新驗證 LINE");
  expect(reentry?.getAttribute("href")).toBe("https://liff.line.me/shared-app/bookings?bookingStore=entry-store");
  expect(mocks.fetchBookings).not.toHaveBeenCalled();
});

it("initializes LINE before returning to the original store and skips endpoint-store reads", async () => {
  let completeInitialization: () => void = () => {};
  mocks.init.mockReturnValue(new Promise<void>((resolve) => { completeInitialization = resolve; }));
  await render("original-store");
  expect(mocks.router.replace).not.toHaveBeenCalled();
  await act(async () => completeInitialization());
  expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/s/original-store/liff/bookings");
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.fetchBookings).not.toHaveBeenCalled();
});

it("shows the reference for identity review and skips booking reads", async () => {
  mocks.token.mockReturnValue("current-token");
  mocks.exchange.mockResolvedValue({ status: "identity_review_required", referenceId: "review-reference" });
  const host = await render();
  expect(host.textContent).toContain("查核編號：review-reference");
  expect(mocks.fetchBookings).not.toHaveBeenCalled();
});

it("reads bookings only after LINE verifies the current account", async () => {
  mocks.token.mockReturnValue("current-account-token");
  let verify: (session: { status: string }) => void = () => {};
  mocks.exchange.mockReturnValue(new Promise<{ status: string }>((resolve) => {
    verify = resolve;
  }));
  mocks.fetchBookings.mockResolvedValue({ status: "ok", upcoming: [], history: [] });

  await render();
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith({
    idToken: "current-account-token",
    storeSlug: "entry-store",
  });
  expect(mocks.fetchBookings).not.toHaveBeenCalled();
  await act(async () => verify({ status: "session_created" }));
  expect(mocks.fetchBookings).toHaveBeenCalledTimes(1);
});
