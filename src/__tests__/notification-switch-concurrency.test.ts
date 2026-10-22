// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ coach: vi.fn(), preference: vi.fn(), active: vi.fn(), balance: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/manager-notification-save", () => ({ saveManagerNotification: (_store: string, id: string, key: string, enabled: boolean) => m.preference(id, key, enabled) }));
vi.mock("@/server/actions/course-coach-notifications", () => ({ setCoachNotification: m.coach }));
vi.mock("@/server/actions/store-line-notification-recipients", () => ({ setManagerNotificationPreference: m.preference, setStoreLineNotificationRecipientActive: m.active, createStoreLineNotificationRecipient: vi.fn(), removeStoreLineNotificationRecipient: vi.fn() }));
vi.mock("@/server/actions/session-balance-notification-toggle", () => ({ setSessionBalanceNotificationToggle: m.balance }));
vi.mock("@/server/actions/reminder", () => ({ saveSessionBalanceTemplateSetting: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: m.error, success: m.success } }));
import { SimpleSessionBalanceReminders } from "@/app/(dashboard)/dashboard/reminders/simple-session-balance-reminders";
import { DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING } from "@/lib/session-balance-notification-settings";
import { CoachNotificationSettings } from "@/app/(dashboard)/dashboard/courses/reminders/coach-notification-settings";
import { LineNotificationRecipientsCard } from "@/app/(dashboard)/dashboard/reminders/line-notification-recipients-card";
let host: HTMLDivElement, root: Root;
function deferred() { let resolve!: (value: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const switches = () => [...host.querySelectorAll<HTMLInputElement>('input[role="switch"]')];
it("lets a second coach preference save while the first waits, and rolls back only the failed preference", async () => {
 const a = deferred(), b = deferred(); m.coach.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 await act(async () => root.render(createElement(CoachNotificationSettings, { initial: { DIGEST: false, CHANGE: false, TRIAL: false }, teachers: [], logs: [] })));
 await act(async () => switches()[0].click());
 expect(switches()[0].checked).toBe(true); expect(switches()[0].disabled).toBe(true); expect(switches()[1].disabled).toBe(false);
 await act(async () => switches()[1].click()); expect(m.coach).toHaveBeenCalledTimes(2); expect(switches()[1].checked).toBe(true);
 await act(async () => a.resolve({ success: false, error: "沒有權限" }));
 expect(switches()[0].checked).toBe(false); expect(switches()[0].disabled).toBe(false); expect(switches()[1].checked).toBe(true); expect(switches()[1].disabled).toBe(true);
 await act(async () => b.resolve({ success: true })); expect(switches()[1].checked).toBe(true); expect(switches()[1].disabled).toBe(false); expect(host.textContent).toContain("沒有權限");
});
it("keeps other manager switches available, blocks duplicate writes, and restores only a rejected field", async () => {
 const a = deferred(), b = deferred(); m.preference.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const recipient = { id: "r1", displayName: "店長", roleLabel: "店長", isActive: true, linkedAt: new Date(), sameDayBookingEnabled: false, preferences: { trial: false } };
 await act(async () => root.render(createElement(LineNotificationRecipientsCard, { storeId: "store-a", recipients: [recipient] })));
 await act(async () => [...host.querySelectorAll("button")].find(el => el.textContent?.includes("設定提醒"))!.click());
 await act(async () => switches()[1].click()); expect(switches()[1].checked).toBe(true); expect(switches()[2].disabled).toBe(false);
 const category = host.querySelector<HTMLSelectElement>('select[aria-label="店長 通知分類"]')!;
 expect(category.disabled).toBe(false);
 await act(async () => { category.value = "店務提醒"; category.dispatchEvent(new Event("change", { bubbles: true })); });
 expect(host.querySelector('section[aria-label="店務提醒"]')).not.toBeNull();
 await act(async () => { category.value = "預約通知"; category.dispatchEvent(new Event("change", { bubbles: true })); });

 await act(async () => { switches()[1].click(); switches()[2].click(); }); expect(m.preference).toHaveBeenCalledTimes(2);
 await act(async () => a.reject(new Error("offline"))); expect(switches()[1].checked).toBe(false); expect(switches()[2].checked).toBe(true); expect(switches()[2].disabled).toBe(true);
 await act(async () => { root.render(createElement(LineNotificationRecipientsCard, { storeId: "store-a", recipients: [{ ...recipient, preferences: { trial: true } }] })); b.resolve({ success: true }); });
 expect(switches()[1].checked).toBe(false); expect(switches()[2].checked).toBe(true); expect(switches()[2].disabled).toBe(false);
});

it("sends only one balance preference per click and preserves the other pending setting on failure", async () => {
 const a = deferred(), b = deferred(); m.balance.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 await act(async () => root.render(createElement(SimpleSessionBalanceReminders, { initialSetting: { ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING, isEnabled: false, lastSessionEnabled: false, planUsedUpEnabled: false } })));
 const controls = () => [...host.querySelectorAll<HTMLButtonElement>('button[role="switch"]')];
 await act(async () => controls()[0].click()); expect(controls()[0].getAttribute("aria-checked")).toBe("true"); expect(controls()[1].disabled).toBe(false);
 await act(async () => controls()[1].click()); expect(m.balance.mock.calls.map(call => call[0])).toEqual([{ key: "lastSessionEnabled", enabled: true }, { key: "planUsedUpEnabled", enabled: true }]);
 await act(async () => a.resolve({ success: false, error: "無法儲存第一項" })); expect(controls()[0].getAttribute("aria-checked")).toBe("false"); expect(controls()[1].getAttribute("aria-checked")).toBe("true");
 await act(async () => b.resolve({ success: true })); expect(controls()[1].getAttribute("aria-checked")).toBe("true"); expect(controls()[1].disabled).toBe(false);
});
