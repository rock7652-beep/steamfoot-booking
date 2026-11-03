// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";

const h = vi.hoisted(() => ({ push: vi.fn(), cancel: vi.fn(), status: vi.fn(), slots: vi.fn(), move: vi.fn(), action: "reschedule" }));
const router = { push: h.push, replace: vi.fn() };
const booking: LiffBookingRow = { id: "original-booking", bookingDate: "2026-11-03", slotTime: "14:00", bookingStatus: "PENDING", bookingType: "PACKAGE_SESSION", isMakeup: false, people: 1 };
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams({ token: "test-token", action: h.action }) }));
vi.mock("@/lib/liff/client", () => ({ initLiff: vi.fn(async () => {}), isInLineClient: () => true, getIDToken: () => "identity-token" }));
vi.mock("@/lib/liff/session-refresh", () => ({ refreshLiffSession: vi.fn(async () => ({ status: "session_created" })) }));
vi.mock("@/lib/liff/profile-loader", () => ({ loadProfileWithSessionRefresh: vi.fn() }));
vi.mock("@/server/actions/liff-my-bookings", () => ({ fetchLiffBookings: vi.fn(async () => ({ status: "ok", upcoming: [booking], history: [] })) }));
vi.mock("@/server/actions/liff-cancel-booking", () => ({ cancelLiffBooking: h.cancel }));
vi.mock("@/app/(liff)/liff/bookings/_components/boundary-blocks", () => ({ Loading: () => null, InfoBlock: () => null }));
vi.mock("@/app/(liff)/liff/bookings/_components/ready-view", () => ({ ReadyView: ({ onRequestCancel }: { onRequestCancel: (booking: LiffBookingRow) => void }) => React.createElement("button", { onClick: () => onRequestCancel(booking) }, "預約操作") }));
vi.mock("@/server/actions/trial-booking-self-service", () => ({
  getTrialBookingManagementStatusFromChat: h.status, getTrialRescheduleSlotsFromChat: h.slots,
  rescheduleTrialBookingFromChat: h.move, cancelTrialBookingFromChat: h.cancel, confirmTrialBookingFromChat: vi.fn(),
}));

import { BookingsList } from "@/app/(liff)/liff/bookings/bookings-list";
import { TrialBookingManager } from "@/app/trial-booking/manage/trial-booking-manager";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  h.action = "reschedule";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  h.status.mockResolvedValue({ bookingDate: "2026-11-03", slotTime: "14:00", bookingStatus: "PENDING", customerRescheduleCount: 0, serviceName: "方案預約" });
  h.slots.mockResolvedValue(["16:00"]);
  h.move.mockResolvedValue("rescheduled");
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function saveIsolatedPreview(name: string) {
  const directory = process.env.BOOKING_SERVICE_PREVIEW_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${name}.html`, `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"><body>${host.innerHTML}</body></html>`);
}
function button(label: string) {
  const result = [...host.querySelectorAll("button")].find(button => button.textContent === label);
  expect(result, `button ${label}`).toBeDefined();
  return result!;
}

it("LINE 改時間導向原預約，尚未選新時間前不取消預約", async () => {
  await act(async () => root.render(React.createElement(BookingsList, { storeSlug: "test", storeName: "測試店", liffId: "test", contactUrl: "", storeAddress: "", storeMapUrl: "", dataSource: "steamfoot" })));
  await act(async () => button("預約操作").click());
  saveIsolatedPreview("liff-modal");
  await act(async () => button("改時間").click());
  expect(h.push).toHaveBeenCalledWith("/s/test/my-bookings/original-booking/reschedule");
  expect(h.cancel).not.toHaveBeenCalled();
});

it("舊體驗提醒連結顯示實際方案，改期後仍顯示同一方案", async () => {
  await act(async () => root.render(React.createElement(TrialBookingManager)));
  expect(host.textContent).toContain("預約自助處理");
  expect(host.textContent).toContain("方案預約");
  expect(host.textContent).not.toContain("體驗預約自助處理");
  saveIsolatedPreview("signed-reschedule");
  await act(async () => button("16:00").click());
  await act(async () => button("確認改為 2026-11-03 16:00").click());
  expect(h.move).toHaveBeenCalledWith({ token: "test-token", date: "2026-11-03", slotTime: "16:00" });
  expect(host.textContent).toContain("16:00（方案預約）");
  expect(host.textContent).toContain("已完成改期");
});
