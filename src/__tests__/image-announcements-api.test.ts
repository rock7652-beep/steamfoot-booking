import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { AppError } from "@/lib/app-error";
const mock = vi.hoisted(() => ({
  permission: vi.fn(), writeStore: vi.fn(), user: vi.fn(), check: vi.fn(), access: vi.fn(), read: vi.fn(),
  store: vi.fn(), asset: vi.fn(), current: vi.fn(), existing: vi.fn(), create: vi.fn(), save: vi.fn(), remove: vi.fn(), lock: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mock.permission, checkPermission: mock.check }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mock.writeStore, validateStoreAccess: mock.access }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.user }));
vi.mock("@/server/services/image-announcements", () => ({ readAnnouncements: mock.read }));
vi.mock("@/lib/db", () => {
  const tx = { $queryRaw: mock.lock, imageAnnouncementSet: { findUnique: mock.current, upsert: mock.save }, imageAnnouncementAsset: { findMany: mock.existing, create: mock.create, deleteMany: mock.remove } };
  return { prisma: { $transaction: (run: (db: typeof tx) => unknown) => run(tx), store: { findUnique: mock.store }, imageAnnouncementAsset: { findFirst: mock.asset } } };
});
import { POST } from "@/app/api/image-announcements/route";
import { GET } from "@/app/api/image-announcements/[id]/route";
const item = { id: "00000000-0000-4000-8000-000000000001", startsOn: "", endsOn: "", enabled: true };
async function write(options: { storeId?: string; revision?: string; items?: unknown[]; image?: Uint8Array; origin?: string } = {}) {
  const form = new FormData(); form.set("storeId", options.storeId ?? "store-a"); form.set("revision", options.revision ?? "0"); form.set("items", JSON.stringify(options.items ?? [item]));
  if (options.image) form.set(item.id, new File([Buffer.from(options.image)], "image.jpg", { type: "image/jpeg" }));
  return POST(new Request("https://example.test/api/image-announcements", { method: "POST", body: form, headers: { origin: options.origin ?? "https://example.test" } }));
}
async function read(id: string, query = "") { return GET(new Request(`https://example.test/api/image-announcements/${id}?store=test${query}`), { params: Promise.resolve({ id }) }); }
beforeEach(() => {
  vi.resetAllMocks();
  mock.permission.mockResolvedValue({ role: "MANAGER", storeId: "store-a" }); mock.writeStore.mockResolvedValue("store-a");
  mock.current.mockResolvedValue(null); mock.existing.mockResolvedValue([{ id: item.id }]);
  mock.store.mockResolvedValue({ id: "store-a", operatingStatus: "ACTIVE" }); mock.read.mockResolvedValue({ revision: 0, items: [item] }); mock.asset.mockResolvedValue({ content: new Uint8Array([1, 2]), mimeType: "image/jpeg" });
});
describe("圖片公告寫入邊界", () => {
  it("拒絕跨來源請求與切換門市後的舊草稿", async () => {
    expect((await write({ origin: "https://other.test" })).status).toBe(403); expect(mock.permission).not.toHaveBeenCalled();
    expect((await write({ storeId: "store-b" })).status).toBe(403); expect(mock.save).not.toHaveBeenCalled();
  });
  it("後端要求管理權限並遵守門市唯讀限制", async () => {
    mock.permission.mockRejectedValue(new AppError("FORBIDDEN", "無權限")); expect((await write()).status).toBe(403); expect(mock.save).not.toHaveBeenCalled();
    mock.permission.mockResolvedValue({ role: "OWNER" }); mock.writeStore.mockRejectedValue(new AppError("FORBIDDEN", "子店唯讀")); expect((await write()).status).toBe(403);
  });
  it("拒絕過期版本，不覆蓋其他人的修改", async () => {
    mock.current.mockResolvedValue({ revision: 2 }); const response = await write(); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: expect.stringContaining("其他人更新") }); expect(mock.create).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
  });
  it("既有圖片必須屬於目前門市", async () => {
    mock.existing.mockResolvedValue([]); expect((await write()).status).toBe(400); expect(mock.save).not.toHaveBeenCalled();
  });
  it("鎖門市後儲存排序並只刪除本店未使用圖片", async () => {
    expect((await write()).status).toBe(200); expect(mock.permission).toHaveBeenCalledWith("business_hours.manage"); expect(mock.lock).toHaveBeenCalled();
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-a" }, update: { revision: { increment: 1 }, items: [item] } }));
    expect(mock.remove).toHaveBeenCalledWith({ where: { storeId: "store-a", id: { notIn: [item.id] } } });
  });
  it("新增圖片先完整解碼，再保存於本店", async () => {
    mock.existing.mockResolvedValue([]);
    const jpeg = await sharp({ create: { width: 30, height: 40, channels: 3, background: "white" } }).jpeg().toBuffer();
    expect((await write({ image: jpeg })).status).toBe(200); expect(mock.create).toHaveBeenCalledWith({ data: { id: item.id, storeId: "store-a", mimeType: "image/jpeg", content: expect.any(Uint8Array) } });
  });
  it("拒絕偽造圖片、超過五張與重複 ID", async () => {
    expect((await write({ image: new Uint8Array([255, 216, 255, 1, 255, 217]) })).status).toBe(400);
    expect((await write({ items: [item, item] })).status).toBe(400); expect((await write({ items: Array(6).fill(item) })).status).toBe(400); expect(mock.save).not.toHaveBeenCalled();
  });
});
describe("公開圖片及後台預覽", () => {
  it("有效試用店可讀取公告，過期及未啟用試用不可讀取", async () => {
    mock.store.mockResolvedValue({id:"store-a",operatingStatus:"TRIAL",planStatus:"TRIAL",planExpiresAt:new Date("2099-12-31T00:00:00Z")});
    expect((await read("list")).status).toBe(200);
    mock.store.mockResolvedValue({id:"store-a",operatingStatus:"TRIAL",planStatus:"TRIAL",planExpiresAt:new Date("2000-01-01T00:00:00Z")});
    expect((await read("list")).status).toBe(404);
    mock.store.mockResolvedValue({id:"store-a",operatingStatus:"TRIAL",planStatus:"CANCELLED",planExpiresAt:null});
    expect((await read("list")).status).toBe(404);
  });
  it("公開清單只回傳有效圖片，不快取", async () => {
    mock.read.mockResolvedValue({ items: [item, { ...item, id: "hidden", enabled: false }, { ...item, id: "future", startsOn: "2099-01-01" }] });
    const response = await read("list"); expect(await response.json()).toEqual({ items: [item] }); expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("知道圖片 ID 也不能讀取未上架、到期、停用圖片", async () => {
    for (const patch of [{ enabled: false }, { startsOn: "2099-01-01" }, { endsOn: "2000-01-01" }]) {
      mock.read.mockResolvedValue({ items: [{ ...item, ...patch }] }); expect((await read(item.id)).status).toBe(404);
    }
    expect(mock.asset).not.toHaveBeenCalled();
  });
  it("預覽也必須通過登入、查看權限與門市授權", async () => {
    expect((await read(item.id, "&preview=1")).status).toBe(404);
    mock.user.mockResolvedValue({ role: "STAFF", staffId: "staff" }); mock.check.mockResolvedValue(true); mock.access.mockRejectedValue(new AppError("FORBIDDEN", "其他店"));
    expect((await read(item.id, "&preview=1")).status).toBe(404); expect(mock.asset).not.toHaveBeenCalled();
    mock.access.mockResolvedValue("store-a"); mock.read.mockResolvedValue({ items: [{ ...item, enabled: false }] }); expect((await read(item.id, "&preview=1")).status).toBe(200);
  });
  it("停用門市不公開，且素材查詢必須限定門市", async () => {
    expect((await read(item.id)).status).toBe(200); expect(mock.asset).toHaveBeenCalledWith({ where: { id: item.id, storeId: "store-a" } });
    mock.store.mockResolvedValue({ id: "store-a", operatingStatus: "DISABLED" }); expect((await read(item.id)).status).toBe(404);
  });
});
