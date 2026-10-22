import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const actions = vi.hoisted(() => ({ preference: vi.fn(), active: vi.fn() }));
vi.mock("@/server/actions/store-line-notification-recipients", () => ({
  setManagerNotificationPreference: actions.preference, setStoreLineNotificationRecipientActive: actions.active,
}));
import { POST } from "@/app/api/settings/manager-notification/route";
const input = { expectedStoreId: "store-a", id: "recipient-a", key: "trial", enabled: true };
function request(body: unknown = input, origin = "https://example.test") {
  return new Request("https://example.test/api/settings/manager-notification", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetAllMocks(); actions.preference.mockResolvedValue({ success: true }); actions.active.mockResolvedValue({ success: true }); });
it("returns only a scoped JSON receipt and stage timings, without RSC", async () => {
  const response = await POST(request());
  expect(actions.preference).toHaveBeenCalledWith("recipient-a", "trial", true, "store-a");
  expect(await response.json()).toEqual({ success: true, storeId: "store-a", data: { id: "recipient-a", key: "trial", enabled: true } });
  expect(response.headers.get("server-timing")).toContain("handler;dur=");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("uses the same authorization for the recipient master switch", async () => {
  expect((await POST(request({ ...input, key: "active" }))).status).toBe(200);
  expect(actions.active).toHaveBeenCalledWith("recipient-a", true, "store-a");
});
it("rejects foreign origins and invalid keys before mutation", async () => {
  expect((await POST(request(input, "https://foreign.test"))).status).toBe(403);
  expect((await POST(request({ ...input, key: "__proto__" }))).status).toBe(400);
  expect((await POST(request({ ...input, expectedStoreId: "" }))).status).toBe(400);
  expect(actions.preference).not.toHaveBeenCalled(); expect(actions.active).not.toHaveBeenCalled();
});
it("does not claim success after authorization rejection or an unknown transport failure", async () => {
  actions.preference.mockResolvedValueOnce({ success: false, error: "Forbidden" }).mockRejectedValueOnce(new Error("connection"));
  expect((await POST(request())).status).toBe(400);
  expect(await (await POST(request())).json()).toMatchObject({ success: false, uncertain: true });
});
