import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ switch: vi.fn() }));
vi.mock("@/server/actions/store-switch", () => ({ switchActiveStore: m.switch }));
import { POST } from "@/app/api/hq/store-view/route";
const request = (body: unknown, origin: string | null = "https://www.steamfoot.com") => new Request("https://www.steamfoot.com/api/hq/store-view", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
});
beforeEach(() => { vi.resetAllMocks(); m.switch.mockResolvedValue({ success: true }); });
it.each([null, "https://another-site.example"])("rejects missing or foreign origin %s before changing view", async origin => {
  expect((await POST(request({ storeId: "ido" }, origin))).status).toBe(403);
  expect(m.switch).not.toHaveBeenCalled();
});
it.each([{}, null, { storeId: 1 }, { storeId: "" }])("rejects malformed selection %j", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(m.switch).not.toHaveBeenCalled();
});
it("uses existing audited ADMIN/store authorization for switching and HQ return", async () => {
  for (const storeId of ["ido", "music", "__all__"]) {
    expect((await POST(request({ storeId }))).status).toBe(200);
    expect(m.switch).toHaveBeenLastCalledWith(storeId);
  }
});
it("propagates authorization denial without claiming a successful switch", async () => {
  m.switch.mockResolvedValue({ success: false, error: "僅總部可切換店舖" });
  const response = await POST(request({ storeId: "ido" }));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ success: false, error: "僅總部可切換店舖" });
});
