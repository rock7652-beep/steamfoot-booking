// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  expiry: vi.fn(), courseExpiry: vi.fn(), booking: vi.fn(), course: vi.fn(),
  savePackage: vi.fn(), saveCourse: vi.fn(), saveTrial: vi.fn(),
  success: vi.fn(), error: vi.fn(), report: vi.fn(),
}));
vi.mock("@/server/actions/reminder", () => ({
  setPlanExpiryReminderEnabled: actions.expiry,
  setBookingReminderTypeEnabled: actions.booking,
  savePackageLineCardReminderSetting: actions.savePackage,
  saveTrialLineCardReminderSetting: actions.saveTrial,
}));
vi.mock("@/server/actions/course-reminders", () => ({
  setCourseExpiryReminderEnabled: actions.courseExpiry,
  setCourseReminderEnabled: actions.course,
  saveCourseReminderBody: actions.saveCourse,
}));
vi.mock("sonner", () => ({ toast: { success: actions.success, error: actions.error } }));

import { SettingsPanelContext } from "@/components/admin/settings-panel-context";
import { PlanExpiryReminderSettingCard } from "@/app/(dashboard)/dashboard/reminders/plan-expiry-reminder-setting-card";
import { PackageLineCardReminderSettingCard } from "@/app/(dashboard)/dashboard/reminders/package-line-card-reminder-setting-card";
import { TrialLineCardReminderSettingCard } from "@/app/(dashboard)/dashboard/reminders/trial-line-card-reminder-setting-card";

const cases = [
  { name: "steam expiry", render: (enabled = false, key = "store-a") => createElement(PlanExpiryReminderSettingCard, { key, initialEnabled: enabled }), toggle: actions.expiry, args: [true] },
  { name: "course expiry", render: (enabled = false, key = "store-a") => createElement(PlanExpiryReminderSettingCard, { key, initialEnabled: enabled, course: true }), toggle: actions.courseExpiry, args: [true] },
  { name: "music expiry", render: (enabled = false, key = "store-a") => createElement(PlanExpiryReminderSettingCard, { key, initialEnabled: enabled, course: true, music: true }), toggle: actions.courseExpiry, args: [true] },
  { name: "package", render: (enabled = false, key = "store-a") => createElement(PackageLineCardReminderSettingCard, { key, initialEnabled: enabled, initialBody: "原始提醒", hasMapLink: false }), toggle: actions.booking, args: ["PACKAGE", true], save: actions.savePackage },
  { name: "course booking", render: (enabled = false, key = "store-a") => createElement(PackageLineCardReminderSettingCard, { key, initialEnabled: enabled, initialBody: "原始提醒", hasMapLink: false, course: true }), toggle: actions.course, args: [true], save: actions.saveCourse },
  { name: "trial", render: (enabled = false, key = "store-a") => createElement(TrialLineCardReminderSettingCard, { key, initialEnabled: enabled, initialBody: "原始提醒", initialMapUrl: "https://maps.google.com/old" }), toggle: actions.booking, args: ["TRIAL", true], save: actions.saveTrial },
];
const formCases = cases.filter(item => "save" in item);
let host: HTMLDivElement, root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function render(element: ReactElement) {
  await act(async () => root.render(createElement(SettingsPanelContext.Provider, {
    value: { report: actions.report, navigate: vi.fn() },
  }, element)));
}
function toggle() { return host.querySelector<HTMLButtonElement>('[role="switch"]')!; }
function summary() { return host.querySelector("summary")!; }
function saveButton() { return [...host.querySelectorAll("button")].find(button => /^(儲存變更|儲存中…)$/.test(button.textContent ?? ""))!; }
function latestGuard() { return actions.report.mock.calls.filter(call => call[1] !== null).at(-1)?.[1]; }
async function inputText(input: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe.each(cases)("$name toggle feedback", item => {
  it("shows pending while collapsed, locks same-tick clicks and confirms state only after success", async () => {
    const request = deferred();
    item.toggle.mockReturnValue(request.promise);
    await render(item.render());
    await act(async () => { toggle().click(); toggle().click(); });
    expect(item.toggle).toHaveBeenCalledExactlyOnceWith(...item.args);
    expect(host.querySelector("details")!.open).toBe(false);
    expect(summary().querySelector('[role="status"]')!.textContent).toBe("儲存中…");
    expect(toggle().disabled).toBe(true);
    expect(toggle().getAttribute("aria-busy")).toBe("true");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(latestGuard()).toEqual({ dirty: false, pending: true });
    expect(actions.success).not.toHaveBeenCalled();

    await act(async () => request.resolve({ success: true }));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(toggle().disabled).toBe(false);
    expect(summary().querySelector('[role="status"]')!.textContent).toBe("開啟");
    expect(latestGuard()).toEqual({ dirty: false, pending: false });
    expect(actions.success).toHaveBeenCalledOnce();
  });

  it("retains confirmed enabled state and shows a server rejection in the collapsed row", async () => {
    item.toggle.mockResolvedValue({ success: false, error: "目前無法修改此提醒" });
    await render(item.render(true));
    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(summary().querySelector('[role="alert"]')!.textContent).toBe("目前無法修改此提醒");
    expect(toggle().disabled).toBe(false);
    expect(actions.success).not.toHaveBeenCalled();
    expect(item.toggle).toHaveBeenCalledTimes(1);
  });

  it.each(["rejected promise", "empty response", "malformed success"])("handles %s without retrying or changing state", async failure => {
    if (failure === "rejected promise") item.toggle.mockRejectedValue(new Error("connection lost"));
    else item.toggle.mockResolvedValue(failure === "empty response" ? undefined : { success: "true" });
    await render(item.render());
    await act(async () => toggle().click());
    expect(summary().querySelector('[role="alert"]')!.textContent).toContain("尚未確認開關儲存結果");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().disabled).toBe(false);
    expect(item.toggle).toHaveBeenCalledTimes(1);
    expect(actions.success).not.toHaveBeenCalled();

    item.toggle.mockResolvedValue({ success: true });
    await act(async () => toggle().click());
    expect(item.toggle).toHaveBeenCalledTimes(2);
    expect(summary().querySelector('[role="alert"]')).toBeNull();
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it.each(["success", "rejection"])("ignores a previous store card's late %s after a keyed remount", async outcome => {
    const oldRequest = deferred();
    const currentRequest = deferred();
    item.toggle.mockReturnValueOnce(oldRequest.promise);
    await render(item.render());
    await act(async () => toggle().click());
    await render(item.render(false, "store-b"));
    item.toggle.mockReturnValueOnce(currentRequest.promise);
    await act(async () => toggle().click());
    await act(async () => {
      if (outcome === "success") oldRequest.resolve({ success: true });
      else oldRequest.reject(new Error("old store connection lost"));
    });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().disabled).toBe(true);
    expect(summary().querySelector('[role="status"]')!.textContent).toBe("儲存中…");
    expect(actions.success).not.toHaveBeenCalled();
    expect(actions.error).not.toHaveBeenCalled();
    await act(async () => currentRequest.resolve({ success: true }));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(toggle().disabled).toBe(false);
    expect(actions.success).toHaveBeenCalledOnce();
  });
});

describe.each(formCases)("$name form feedback", item => {
  it("keeps form feedback independent from toggling and preserves edits made during the toggle", async () => {
    const request = deferred();
    item.toggle.mockReturnValue(request.promise);
    await render(item.render());
    host.querySelector("details")!.open = true;
    const textarea = host.querySelector("textarea")!;
    await act(async () => toggle().click());
    expect(saveButton().textContent).toBe("儲存變更");
    expect(saveButton().disabled).toBe(true);
    expect(textarea.disabled).toBe(false);
    await inputText(textarea, "尚未儲存的文字");
    await act(async () => request.resolve({ success: true }));
    expect(textarea.value).toBe("尚未儲存的文字");
    expect(latestGuard()).toEqual({ dirty: true, pending: false });
    expect(item.save).not.toHaveBeenCalled();
  });

  it("locks form fields and same-tick writes, then retains the draft after a transport error", async () => {
    const request = deferred();
    item.save!.mockReturnValue(request.promise);
    await render(item.render());
    host.querySelector("details")!.open = true;
    const textarea = host.querySelector("textarea")!;
    const map = host.querySelector<HTMLInputElement>('input[type="url"]');
    await inputText(textarea, "  修改後提醒  ");
    if (map) await inputText(map, "https://maps.google.com/new");
    await act(async () => { saveButton().click(); saveButton().click(); toggle().click(); });
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(item.toggle).not.toHaveBeenCalled();
    expect(textarea.disabled).toBe(true);
    if (map) expect(map.disabled).toBe(true);
    expect(saveButton().textContent).toBe("儲存中…");
    expect(summary().querySelector('[role="status"]')!.textContent).toBe("關閉");
    expect(latestGuard()).toEqual({ dirty: true, pending: true });

    await act(async () => request.reject(new Error("connection lost")));
    expect(textarea.value).toBe("  修改後提醒  ");
    expect(textarea.disabled).toBe(false);
    if (map) { expect(map.value).toBe("https://maps.google.com/new"); expect(map.disabled).toBe(false); }
    expect(host.textContent).toContain("輸入內容已保留");
    host.querySelector("details")!.open = false;
    expect(summary().querySelector('[role="alert"]')!.textContent).toContain("尚未確認儲存結果");
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(latestGuard()).toEqual({ dirty: true, pending: false });

    item.save!.mockResolvedValue({ success: true });
    host.querySelector("details")!.open = true;
    await act(async () => saveButton().click());
    expect(item.save).toHaveBeenLastCalledWith(map ? { body: "修改後提醒", mapUrl: "https://maps.google.com/new" } : { body: "修改後提醒" });
    expect(textarea.value).toBe("修改後提醒");
    expect(latestGuard()).toEqual({ dirty: false, pending: false });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(saveButton().disabled).toBe(true);
  });

  it.each(["rejection", "unknown"])("preserves unsaved content after a %s while restoring defaults", async failure => {
    item.save!.mockResolvedValue(failure === "rejection" ? { success: false, error: "提醒內容無法儲存" } : null);
    await render(item.render());
    host.querySelector("details")!.open = true;
    const textarea = host.querySelector("textarea")!;
    await inputText(textarea, "我正在編輯的草稿");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.startsWith("恢復預設"))!.click());
    expect(textarea.value).toBe("我正在編輯的草稿");
    expect(latestGuard()).toEqual({ dirty: true, pending: false });
    expect(host.textContent).toContain(failure === "rejection" ? "提醒內容無法儲存" : "尚未確認儲存結果");
    expect(actions.success).not.toHaveBeenCalled();
  });
});

it("keeps separate reminder cards independent", async () => {
  const request = deferred();
  actions.expiry.mockReturnValue(request.promise);
  actions.booking.mockResolvedValue({ success: true });
  await render(createElement("div", null, cases[0].render(false, "store-a-expiry"), cases[5].render(false, "store-a-trial")));
  const switches = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
  await act(async () => switches[0].click());
  expect(switches[1].disabled).toBe(false);
  await act(async () => switches[1].click());
  expect(actions.booking).toHaveBeenCalledExactlyOnceWith("TRIAL", true);
  expect(switches[1].getAttribute("aria-checked")).toBe("true");
  await act(async () => request.resolve({ success: false, error: "僅到期提醒發生錯誤" }));
  expect(switches[0].getAttribute("aria-checked")).toBe("false");
  expect(switches[1].getAttribute("aria-checked")).toBe("true");
});
