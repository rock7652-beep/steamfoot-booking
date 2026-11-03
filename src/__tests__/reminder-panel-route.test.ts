import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ steam: vi.fn(), course: vi.fn() }));
vi.mock("@/server/queries/reminder-panel", () => ({ readSteamReminderPanel: m.steam, readCourseReminderPanel: m.course }));
import { GET } from "@/app/api/settings/reminder-panel/route";
import { AppError } from "@/lib/errors";
const request = (values = {}, headers: Record<string, string> = { "x-reminder-panel": "1" }) => new Request("https://test.invalid/api/settings/reminder-panel?" + new URLSearchParams({ module: "steamfoot", expectedStoreId: "store-a", expectedActorId: "owner-a", query: "tab=logs&status=FAILED", ...values }), { headers });
beforeEach(() => { vi.resetAllMocks(); m.steam.mockResolvedValue({ storeId: "store-a", logs: [{ at: new Date("2026-10-22T10:00:00Z") }] }); });
it("returns a private JSON receipt for the exact actor/store/query, with date metadata", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("server-timing")).toContain("reminder;dur=");
  expect(m.steam).toHaveBeenCalledWith({ tab: "logs", status: "FAILED" }, "store-a", "owner-a");
  expect(m.course).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ success: true, module: "steamfoot", storeId: "store-a", query: "tab=logs&status=FAILED", data: { dates: [["logs", "0", "at"]] } });
});
it("dispatches course reads through the same authorized page loader", async () => {
  m.course.mockResolvedValue({ storeId: "store-a" });
  expect((await GET(request({ module: "course" }))).status).toBe(200);
  expect(m.course).toHaveBeenCalledWith({ tab: "logs", status: "FAILED" }, "store-a", "owner-a");
});
it.each([{ module: "spa" }, { expectedStoreId: "" }, { expectedActorId: "" }, { query: "storeId=other" }, { query: "x".repeat(2001) }])("rejects invalid parameters before loading: %j", async values => {
  expect((await GET(request(values))).status).toBe(400);
  expect(m.steam).not.toHaveBeenCalled(); expect(m.course).not.toHaveBeenCalled();
});
it("rejects cross-site and ordinary unmarked requests", async () => {
  expect((await GET(request({}, {}))).status).toBe(403);
  expect((await GET(request({}, { "x-reminder-panel": "1", "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect(m.steam).not.toHaveBeenCalled();
});
it("does not leak raw authorization or infrastructure errors", async () => {
  for (const error of [new AppError("FORBIDDEN", "private detail"), new Error("database secret")]) {
    m.steam.mockRejectedValueOnce(error);
    const response = await GET(request());
    expect(response.status).toBe(error instanceof AppError ? 403 : 503);
    expect(JSON.stringify(await response.json())).not.toMatch(/private detail|database secret/);
  }
});
