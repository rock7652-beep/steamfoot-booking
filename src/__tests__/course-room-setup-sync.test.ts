// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { courseSetupSteps } from "@/lib/course-setup-progress";
import { COURSE_ROOM_SAVED } from "@/lib/course-room-input";
const m = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/hq/dashboard/courses", useSearchParams: () => new URLSearchParams("view=rooms&setupStep=room"), useRouter: () => ({ refresh: m.refresh, push: m.push }) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never), resolveDashboardHref: (href: string) => href }));
vi.mock("@/server/actions/course-setup", () => ({ saveCourseSetupReminder: vi.fn(), readCourseSetupProgress: m.read }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { CourseSetupGuide } from "@/components/admin/course-setup-guide";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: Root;
const counts = { openDays: 1, rooms: 0, templates: 0, plans: 0, sessions: 0, coaches: 0, qualifiedCoaches: 0 };
const steps = courseSetupSteps(counts, true);
const event = (storeId = "store-a") => window.dispatchEvent(new CustomEvent(COURSE_ROOM_SAVED, { detail: { storeId } }));
beforeEach(async () => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(CourseSetupGuide, { storeId: "store-a", steps, preference: { mode: "show" }, login: "test" }))); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("updates only setup progress and offers the next step without refreshing the page", async () => {
  m.read.mockResolvedValue({ success: true, storeId: "store-a", steps: courseSetupSteps({ ...counts, rooms: 1 }, true) });
  await act(async () => { event(); });
  expect(host.textContent).toContain("已完成 2/6"); expect(host.textContent).toContain("繼續下一步"); expect(m.refresh).not.toHaveBeenCalled();
});
it("ignores another store's event and response", async () => {
  await act(async () => { event("store-b"); }); expect(m.read).not.toHaveBeenCalled();
  m.read.mockResolvedValue({ success: true, storeId: "store-b", steps: courseSetupSteps({ ...counts, rooms: 1 }, true) });
  await act(async () => { event(); }); expect(host.textContent).toContain("已完成 1/6");
});
it("shows saved-but-progress-failed and retries without resubmitting the room", async () => {
  m.read.mockResolvedValueOnce({ success: false }); await act(async () => { event(); });
  expect(host.textContent).toContain("資料已儲存，設定進度暫時無法更新");
  m.read.mockResolvedValueOnce({ success: true, storeId: "store-a", steps: courseSetupSteps({ ...counts, rooms: 1 }, true) });
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "重試更新")!.click());
  expect(host.textContent).toContain("已完成 2/6"); expect(m.refresh).not.toHaveBeenCalled();
});
it("an older background response cannot overwrite the latest result", async () => {
  let older!: (value: unknown) => void;
  m.read.mockImplementationOnce(() => new Promise(resolve => { older = resolve; }));
  await act(async () => { event(); });
  m.read.mockResolvedValueOnce({ success: true, storeId: "store-a", steps: courseSetupSteps({ ...counts, rooms: 1 }, true) });
  await act(async () => { event(); });
  await act(async () => { older({ success: true, storeId: "store-a", steps }); });
  expect(host.textContent).toContain("已完成 2/6");
});
