"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { coursePrisma } from "@/lib/course-db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import {
  buildCourseOccurrences,
  courseScheduleInput,
  courseTemplateInput,
} from "@/lib/course-scheduling";
import { formatTWDateTime } from "@/lib/date-utils";

async function writableStore() {
  const user = await requirePermission("booking.create");
  const storeId = await resolveWriteStoreId(user);
  await requireCourseStore(storeId);
  return { user, storeId };
}

export async function createCourseRoom(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const name = z
      .string()
      .trim()
      .min(1, "請填寫教室名稱")
      .max(80)
      .parse(input);
    const room = await coursePrisma.courseRoom.create({
      data: { name, storeId },
      select: { id: true, name: true },
    });
    revalidatePath("/dashboard/courses");
    return { success: true as const, data: room };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createCourseTemplate(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const data = courseTemplateInput.parse(input);
    const room = await coursePrisma.courseRoom.findFirst({
      where: { id: data.defaultRoomId, storeId, isActive: true },
      select: { id: true },
    });
    if (!room) throw new AppError("VALIDATION", "請選擇本店可使用的教室");
    await coursePrisma.courseTemplate.create({ data: { ...data, storeId } });
    revalidatePath("/dashboard/courses");
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createCourseSchedule(input: unknown) {
  try {
    const { user, storeId } = await writableStore();
    const data = courseScheduleInput.parse(input);
    let occurrences: ReturnType<typeof buildCourseOccurrences>;
    try {
      occurrences = buildCourseOccurrences(data);
    } catch (error) {
      throw new AppError(
        "VALIDATION",
        error instanceof Error ? error.message : "排課日期不正確",
      );
    }
    const result = await coursePrisma.$transaction(
      async (tx) => {
        // Serialize this store's batches; a retried request returns its original
        // batch. DB exclusion constraints also protect writes outside this action.
        const stores = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE
      `;
        if (!stores.length)
          throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
        const existing = await tx.courseSession.findMany({
          where: { storeId, requestKey: data.requestKey },
          orderBy: { requestIndex: "asc" },
        });
        if (existing.length) {
          if (
            existing.length !== occurrences.length ||
            existing.some(
              (session, index) =>
                session.createdById !== user.id ||
                session.templateId !== data.templateId ||
                session.roomId !== data.roomId ||
                session.coachId !== data.coachId ||
                session.capacity !== data.capacity ||
                session.startsAt.getTime() !==
                  occurrences[index].startsAt.getTime() ||
                session.endsAt.getTime() !==
                  occurrences[index].endsAt.getTime(),
            )
          )
            throw new AppError(
              "CONFLICT",
              "這次排課已送出，請重新開啟排課表單",
            );
          return { count: existing.length };
        }
        const [template, room, coaches] = await Promise.all([
          tx.courseTemplate.findFirst({
            where: { id: data.templateId, storeId, isActive: true },
          }),
          tx.courseRoom.findFirst({
            where: { id: data.roomId, storeId, isActive: true },
            select: { id: true },
          }),
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Staff" WHERE id = ${data.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        ]);
        if (!template || !room || !coaches.length)
          throw new AppError("VALIDATION", "請選擇本店有效的課程、教室與教練");
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            cancelledAt: null,
            AND: [
              { OR: [{ roomId: data.roomId }, { coachId: data.coachId }] },
              {
                OR: occurrences.map((range) => ({
                  startsAt: { lt: range.endsAt },
                  endsAt: { gt: range.startsAt },
                })),
              },
            ],
          },
          orderBy: { startsAt: "asc" },
        });
        if (conflict)
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "教練"}已有課程，整批尚未建立`,
          );
        await tx.courseSession.createMany({
          data: occurrences.map((range, requestIndex) => ({
            ...range,
            storeId,
            templateId: template.id,
            nameSnapshot: template.name,
            roomId: room.id,
            coachId: data.coachId,
            pointCost: template.pointCost,
            capacity: data.capacity,
            requestKey: data.requestKey,
            requestIndex,
            createdById: user.id,
          })),
        });
        return { count: occurrences.length };
      },
      { timeout: 15000 },
    );
    revalidatePath("/dashboard/courses");
    return { success: true as const, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}
