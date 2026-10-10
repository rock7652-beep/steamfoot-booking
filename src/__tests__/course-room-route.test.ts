import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const m = vi.hoisted(() => ({ create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/server/services/course-room-create", () => ({ createCourseRoomWithReceipt: m.create }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/server/services/course-resources", () => ({ handleCourseActionError: (error: unknown) => ({ success: false, error: error instanceof Error ? error.message : "error" }) }));
import { POST } from "@/app/api/courses/rooms/route";
const input = { name: "教室 A", expectedStoreId: "store-a", requestKey: "26b2e47e-2067-4e2e-8db3-851f830cd325" };
const request = (origin = "https://app.test", body: unknown = input) => new Request("https://app.test/api/courses/rooms", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); m.create.mockResolvedValue({ room: { id: "room-a", name: "教室 A" }, storeId: "store-a" }); });
it("rejects cross-origin and malformed submissions before write authorization", async () => {
  expect((await POST(request("https://evil.test"))).status).toBe(403);
  expect((await POST(request("https://app.test", {}))).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
});
it("responds only with the committed row and marks canonical pages stale", async () => {
  const result = await POST(request()); expect(await result.json()).toMatchObject({ success: true, storeId: "store-a", data: { id: "room-a" } });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(m.revalidate.mock.calls.map(call => call[0])).toEqual(["/dashboard/courses", "/hq/dashboard/courses", "/dashboard"]);
});
it("does not report a committed insert as a failed save if invalidation fails", async () => {
  m.revalidate.mockImplementation(() => { throw new Error("cache unavailable"); });
  expect(await (await POST(request())).json()).toMatchObject({ success: true, syncWarning: true });
});
it("keeps unknown database outcomes distinct from a definite rejection", async () => {
  m.create.mockRejectedValueOnce(new Error("timeout"));
  expect(await (await POST(request())).json()).toMatchObject({ success: false, uncertain: true });
  m.create.mockRejectedValueOnce(new AppError("FORBIDDEN", "權限不足"));
  expect(await (await POST(request())).json()).toMatchObject({ success: false, uncertain: false });
  expect(m.revalidate).not.toHaveBeenCalled();
});
