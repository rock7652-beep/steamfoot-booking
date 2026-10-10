import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { courseRoomInput } from "@/lib/course-room-input";
const m = vi.hoisted(() => ({ manager: vi.fn(), create: vi.fn(), find: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseRoom: { create: m.create, findUnique: m.find } } }));
import { createCourseRoomWithReceipt } from "@/server/services/course-room-create";
const input = { name: "教室 A", requestKey: "26b2e47e-2067-4e2e-8db3-851f830cd325", expectedStoreId: "store-a" };
let rows: Map<string, Record<string, unknown>>;
beforeEach(() => {
  vi.clearAllMocks(); rows = new Map();
  m.manager.mockResolvedValue({ user: { id: "owner-a" }, storeId: "store-a" });
  m.create.mockImplementation(async ({ data }) => {
    if (rows.has(data.id) || [...rows.values()].some(row => row.storeId === data.storeId && row.name === data.name)) throw { code: "P2002" };
    const row = { ...data, isActive: true }; rows.set(data.id, row); return row;
  });
  m.find.mockImplementation(async ({ where }) => rows.get(where.id) ?? null);
});
it("creates a complete authoritative row using booking.create authorization", async () => {
  const result = await createCourseRoomWithReceipt(input);
  expect(m.manager).toHaveBeenCalledWith("booking.create");
  expect(result).toEqual({ storeId: "store-a", room: { ...courseRoomInput.parse(input), id: expect.stringMatching(/^room_/), isActive: true } });
  expect(m.create).toHaveBeenCalledTimes(1); expect(m.find).not.toHaveBeenCalled();
});
it("concurrent retries and a lost-response retry return one committed room", async () => {
  const results = await Promise.all([createCourseRoomWithReceipt(input), createCourseRoomWithReceipt(input)]);
  expect(results[0]).toEqual(results[1]); expect(rows.size).toBe(1);
  expect(await createCourseRoomWithReceipt(input)).toEqual(results[0]); expect(rows.size).toBe(1);
});
it("never writes when active store changed", async () => {
  m.manager.mockResolvedValue({ user: { id: "owner-a" }, storeId: "store-b" });
  await expect(createCourseRoomWithReceipt(input)).rejects.toThrow("店舖已切換"); expect(m.create).not.toHaveBeenCalled();
});
it("rejects denied permission before touching the database", async () => {
  m.manager.mockRejectedValue(new AppError("FORBIDDEN", "權限不足"));
  await expect(createCourseRoomWithReceipt(input)).rejects.toThrow("權限不足"); expect(m.create).not.toHaveBeenCalled();
});
it("rejects a changed payload on the same key without overwriting or duplicating", async () => {
  await createCourseRoomWithReceipt(input);
  await expect(createCourseRoomWithReceipt({ ...input, name: "另一間" })).rejects.toThrow("內容不同");
  expect([...rows.values()].map(row => row.name)).toEqual(["教室 A"]);
});
it("explains an existing name from a different request", async () => {
  await createCourseRoomWithReceipt(input);
  await expect(createCourseRoomWithReceipt({ ...input, requestKey: "0369de99-cbbb-4a0b-bbab-75dc22e0c632" })).rejects.toThrow("同名空間");
  expect(rows.size).toBe(1);
});
it("store and actor are part of the receipt identity", async () => {
  const first = await createCourseRoomWithReceipt(input);
  m.manager.mockResolvedValue({ user: { id: "owner-a" }, storeId: "store-b" });
  const second = await createCourseRoomWithReceipt({ ...input, expectedStoreId: "store-b" });
  expect(second.room.id).not.toBe(first.room.id); expect(rows.size).toBe(2);
});
