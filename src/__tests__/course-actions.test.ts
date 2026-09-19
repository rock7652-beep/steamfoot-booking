import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookings: vi.fn(),
  permission: vi.fn(),
  store: vi.fn(),
  module: vi.fn(),
  raw: vi.fn(),
  existing: vi.fn(),
  conflict: vi.fn(),
  template: vi.fn(),
  room: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  catalogUpdate: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/server/services/course-access", () => ({
  courseManager: async (permission: string) => {
    const user = await mocks.permission(permission);
    const storeId = await mocks.store(user);
    await mocks.module(storeId);
    return { user, storeId };
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mocks.store }));
vi.mock("@/lib/industry-module-server", () => ({
  requireCourseStore: mocks.module,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/course-db", () => ({
  coursePrisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: mocks.raw,
        courseSession: {
          findMany: mocks.existing,
          findFirst: mocks.conflict,
          createMany: mocks.create,
          update: mocks.update,
        },
        courseBooking: { findMany: mocks.bookings },
        courseTemplate: {
          findFirst: mocks.template,
          updateMany: mocks.catalogUpdate,
        },
        courseRoom: { findFirst: mocks.room, updateMany: mocks.catalogUpdate },
      }),
  },
}));
import {
  createCourseSchedule,
  updateCourseSession,
  setCourseCatalogStatus,
} from "@/server/actions/course";
import { AppError } from "@/lib/errors";
const input = {
  templateId: "yoga",
  roomId: "room-a",
  coachId: "coach-a",
  date: "2026-09-22",
  time: "18:00",
  durationMinutes: 60,
  capacity: 10,
  repeatUntil: "2026-10-06",
  requestKey: "cbd7b9ea-0638-4046-a1b4-11360f2cc955",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.bookings.mockResolvedValue([]);
  mocks.permission.mockResolvedValue({ id: "owner-a" });
  mocks.store.mockResolvedValue("store-a");
  mocks.module.mockResolvedValue(undefined);
  mocks.raw.mockImplementation(async (sql: TemplateStringsArray) => /BusinessHours|SpecialBusinessDay/.test(sql.join("")) ? [] : [{ id: "valid",courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["yoga"] }]);
  mocks.existing.mockResolvedValue([]);
  mocks.conflict.mockResolvedValue(null);
  mocks.template.mockResolvedValue({ id: "yoga", name: "瑜珈", pointCost: 2,isActive:true,visibility:"PUBLIC" });
  mocks.room.mockResolvedValue({ id: "room-a",capacity:null });
  mocks.create.mockResolvedValue({ count: 3 });
});
describe("course editing", () => {
  const edit = {
    ...input,
    id: "session-a",
    nameSnapshot: "新課名",
    pointCost: 3,
    capacity: 12,
  };
  it("updates only the selected store session and excludes itself from conflicts", async () => {
    mocks.conflict
      .mockResolvedValueOnce({ id: "session-a" })
      .mockResolvedValueOnce(null);
    expect(await updateCourseSession(edit)).toEqual({ success: true });
    expect(mocks.permission).toHaveBeenCalledWith("booking.update");
    expect(mocks.conflict.mock.calls[1][0].where).toMatchObject({
      storeId: "store-a",
      id: { not: "session-a" },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-a", storeId: "store-a" },
        data: expect.objectContaining({
          capacity: 12,
          nameSnapshot: "新課名",
          pointCost: 3,
        }),
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves the original session when a new time conflicts", async () => {
    mocks.conflict
      .mockResolvedValueOnce({ id: "session-a" })
      .mockResolvedValueOnce({
        startsAt: new Date("2026-09-22T10:00:00Z"),
        roomId: "room-a",
      });
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("尚未儲存修改"),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("preserves completed attendance history and card expiry on rescheduling", async () => {
    mocks.conflict.mockResolvedValue({ id: "session-a", pointCost: 3 });
    mocks.bookings.mockResolvedValue([
      { status: "ATTENDED", card: { expiresAt: new Date("2027-01-01") } },
    ]);
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("已完成點名"),
    });
    mocks.bookings.mockResolvedValue([
      { status: "RESERVED", card: { expiresAt: new Date("2026-09-21") } },
    ]);
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("方案期限"),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects foreign sessions and invalid capacity", async () => {
    expect(await updateCourseSession(edit)).toMatchObject({ success: false });
    expect(await updateCourseSession({ ...edit, capacity: 0 })).toMatchObject({
      success: false,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
describe("course scheduling action", () => {
  it("derives store and cost on the server, and writes one batch", async () => {
    const result = await createCourseSchedule({
      ...input,
      storeId: "victim",
      pointCost: 0,
    });
    expect(result).toEqual({ success: true, data: { count: 3 } });
    const rows = mocks.create.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        (r: { storeId: string; pointCost: number }) =>
          r.storeId === "store-a" && r.pointCost === 2,
      ),
    ).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("booking.create");
  });
  it("does not write any occurrence if a later week conflicts", async () => {
    mocks.conflict.mockResolvedValue({
      startsAt: new Date("2026-09-29T10:00:00Z"),
      roomId: "room-a",
    });
    const result = await createCourseSchedule(input);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("2026-09-29"),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects foreign-store or inactive references before writes", async () => {
    mocks.room.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns the original batch for a network retry, without a second write", async () => {
    const { buildCourseOccurrences } = await import("@/lib/course-scheduling");
    mocks.existing.mockResolvedValue(
      buildCourseOccurrences(input).map((range) => ({
        ...range,
        ...input,
        createdById: "owner-a",
      })),
    );
    expect(await createCourseSchedule(input)).toEqual({
      success: true,
      data: { count: 3 },
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      await createCourseSchedule({ ...input, capacity: 11 }),
    ).toMatchObject({ success: false });
  });
  it("blocks writes when store access or module authorization fails", async () => {
    mocks.store.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "不可寫入其他店家"),
    );
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    mocks.module.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能僅適用於課程門市"),
    );
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.raw).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("copy course schedule", () => {
  it("copies the selected session snapshot instead of changed template defaults", async () => {
    mocks.conflict
      .mockResolvedValueOnce({
        id: "source",
        templateId: "yoga",
        nameSnapshot: "單堂調整名稱",
        pointCost: 4,
      })
      .mockResolvedValueOnce(null);
    expect(
      await createCourseSchedule({ ...input, sourceSessionId: "source" }),
    ).toMatchObject({ success: true });
    expect(mocks.create.mock.calls[0][0].data[0]).toMatchObject({
      nameSnapshot: "單堂調整名稱",
      pointCost: 4,
    });
  });
  it("refuses a missing or foreign source before creating copies", async () => {
    expect(
      await createCourseSchedule({ ...input, sourceSessionId: "foreign" }),
    ).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("catalogue availability", () => {
  it("changes only a record in the authorized course store and preserves sessions", async () => {
    mocks.catalogUpdate.mockResolvedValue({ count: 1 });
    expect(
      await setCourseCatalogStatus({
        kind: "template",
        id: "yoga",
        isActive: false,
        storeId: "foreign",
      }),
    ).toEqual({ success: true });
    expect(mocks.permission).toHaveBeenCalledWith("booking.update");
    expect(mocks.catalogUpdate).toHaveBeenCalledWith({
      where: { id: "yoga", storeId: "store-a" },
      data: { isActive: false,visibility:"OFF" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      await setCourseCatalogStatus({
        kind: "template",
        id: "yoga",
        isActive: true,
      }),
    ).toEqual({ success: true });
  });
  it("rejects foreign records and unauthorized changes", async () => {
    mocks.catalogUpdate.mockResolvedValue({ count: 0 });
    expect(
      await setCourseCatalogStatus({
        kind: "room",
        id: "foreign",
        isActive: false,
      }),
    ).toMatchObject({ success: false });
    mocks.catalogUpdate.mockClear();
    mocks.permission.mockRejectedValue(
      new AppError("FORBIDDEN", "no permission"),
    );
    expect(
      await setCourseCatalogStatus({ kind: "room", id: "a", isActive: false }),
    ).toMatchObject({ success: false });
    expect(mocks.catalogUpdate).not.toHaveBeenCalled();
  });
  it("does not schedule an unpublished template or hidden room", async () => {
    mocks.template.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.template).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "yoga", storeId: "store-a", isActive: true },
      }),
    );
    mocks.template.mockResolvedValue({
      id: "yoga",
      name: "Yoga",
      pointCost: 2,
    });
    mocks.room.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
