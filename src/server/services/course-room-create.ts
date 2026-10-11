import "server-only";
import { createHash } from "node:crypto";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { courseRoomCreateInput } from "@/lib/course-room-input";
import { courseManager } from "@/server/services/course-access";

const select = { id: true, storeId: true, name: true, category: true, capacity: true,
  details: true, equipment: true, location: true, rentalEnabled: true,
  rentalHourlyRate: true, rentalBufferMinutes: true, isActive: true } as const;

/** The existing primary key makes retries atomic without a schema migration. */
export async function createCourseRoomWithReceipt(input: unknown) {
  const started = performance.now();
  let authMs = 0, databaseMs = 0, outcome = "error";
  try {
    const { user, storeId } = await courseManager("booking.create");
    authMs = Math.round(performance.now() - started);
    const { expectedStoreId, requestKey, ...data } = courseRoomCreateInput.parse(input);
    if (storeId !== expectedStoreId) throw new AppError("CONFLICT", "店舖已切換，請回原店確認空間後再操作。");
    const id = `room_${createHash("sha256").update(JSON.stringify([storeId, user.id, requestKey])).digest("hex")}`;
    const databaseStarted = performance.now();
    // The PK serializes concurrent retries without updating an earlier room.
    let room;
    try {
      room = await coursePrisma.courseRoom.create({ data: { id, storeId, ...data }, select });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      room = await coursePrisma.courseRoom.findUnique({ where: { id }, select });
      if (!room) throw new AppError("CONFLICT", "本店已有同名空間，請查看清單或修改名稱。");
    }
    databaseMs = Math.round(performance.now() - databaseStarted);
    if (room.storeId !== storeId || Object.entries(data).some(([key, value]) => room[key as keyof typeof room] !== value)) {
      throw new AppError("CONFLICT", "這次送出已處理且內容不同，請先核對空間清單。");
    }
    outcome = "saved";
    const { storeId: savedStoreId, ...savedRoom } = room;
    return { room: savedRoom, storeId: savedStoreId };
  } finally {
    // Fixed labels and durations only; no names, IDs, request bodies or tokens.
    console.info("[COURSE_ROOM_CREATE_PERF]", { outcome, authMs, databaseMs, totalMs: Math.round(performance.now() - started) });
  }
}
