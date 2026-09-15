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

async function writableStore(
  permission: "booking.create" | "booking.update" = "booking.create",
) {
  const user = await requirePermission(permission);
  const storeId = await resolveWriteStoreId(user);
  await requireCourseStore(storeId);
  return { user, storeId };
}

export async function updateCourseRoom(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = z
      .object({
        id: z.string().min(1),
        name: z.string().trim().min(1, "請填寫教室名稱").max(80),
        category: z.string().trim().max(40).default(""),
        capacity: z.number().int().min(1).max(500).nullable().default(null),
        details: z.string().trim().max(5000).default(""),
      })
      .parse(input);
    const result = await coursePrisma.courseRoom.updateMany({
      where: { id: data.id, storeId },
      data: {
        name: data.name,
        category: data.category,
        capacity: data.capacity,
        details: data.details,
      },
    });
    if (!result.count)
      throw new AppError("VALIDATION", "找不到本店教室，請重新整理");
    revalidatePath("/dashboard/courses");
    revalidatePath("/hq/dashboard/courses");
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function updateCourseTemplate(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const { id, ...data } = courseTemplateInput
      .extend({ id: z.string().min(1) })
      .parse(input);
    const room = data.defaultRoomId
      ? await coursePrisma.courseRoom.findFirst({
          where: { id: data.defaultRoomId, storeId, isActive: true },
        })
      : null;
    if (data.defaultRoomId && !room)
      throw new AppError("VALIDATION", "請選擇本店可使用的教室");
    const result = await coursePrisma.courseTemplate.updateMany({
      where: { id, storeId },
      data,
    });
    if (!result.count)
      throw new AppError("VALIDATION", "找不到本店課程，請重新整理");
    revalidatePath("/dashboard/courses");
    revalidatePath("/hq/dashboard/courses");
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function updateCourseSession(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = courseScheduleInput
      .omit({ templateId: true, requestKey: true, repeatUntil: true })
      .extend({
        id: z.string().min(1),
        nameSnapshot: z.string().trim().min(1, "請填寫課程名稱").max(80),
        pointCost: z.number().int().min(1).max(10000),
      })
      .parse(input);
    const [range] = buildCourseOccurrences({
      ...data,
      templateId: "edit",
      requestKey: "00000000-0000-4000-8000-000000000000",
    });
    await coursePrisma.$transaction(
      async (tx) => {
        const stores = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
        if (!stores.length)
          throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
        const [session, room, coaches] = await Promise.all([
          tx.courseSession.findFirst({
            where: { id: data.id, storeId, cancelledAt: null },
          }),
          tx.courseRoom.findFirst({
            where: { id: data.roomId, storeId, isActive: true },
          }),
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "Staff" WHERE id = ${data.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        ]);
        if (!session || !room || !coaches.length)
          throw new AppError("VALIDATION", "請選擇本店有效的排課、教室與教練");
        const bookings = await tx.courseBooking.findMany({
          where: {
            storeId,
            sessionId: session.id,
            status: { not: "CANCELLED" },
          },
        });
        if (data.capacity < bookings.length)
          throw new AppError("CONFLICT", "人數上限不能少於已預約人數");
        if (bookings.length && data.pointCost !== session.pointCost)
          throw new AppError(
            "CONFLICT",
            "已有預約不能改動每人點數，請先處理預約",
          );
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            id: { not: data.id },
            cancelledAt: null,
            startsAt: { lt: range.endsAt },
            endsAt: { gt: range.startsAt },
            OR: [{ roomId: data.roomId }, { coachId: data.coachId }],
          },
          orderBy: { startsAt: "asc" },
        });
        if (conflict)
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(conflict.startsAt)} ${conflict.roomId === data.roomId ? "教室" : "教練"}已有課程，尚未儲存修改`,
          );
        await tx.courseSession.update({
          where: { id: session.id, storeId },
          data: {
            ...range,
            nameSnapshot: data.nameSnapshot,
            roomId: data.roomId,
            coachId: data.coachId,
            capacity: data.capacity,
            pointCost: data.pointCost,
          },
        });
      },
      { timeout: 15000 },
    );
    revalidatePath("/dashboard/courses");
    revalidatePath("/hq/dashboard/courses");
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createCourseRoom(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const { name, category, capacity, details } = z
      .object({
        name: z.string().trim().min(1, "請填寫教室名稱").max(80),
        category: z.string().trim().max(40).default(""),
        capacity: z.number().int().min(1).max(500).nullable().default(null),
        details: z.string().trim().max(5000).default(""),
      })
      .parse(typeof input === "string" ? { name: input } : input);
    const room = await coursePrisma.courseRoom.create({
      data: { name, category, capacity, details, storeId },
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
    const room = data.defaultRoomId
      ? await coursePrisma.courseRoom.findFirst({
          where: { id: data.defaultRoomId, storeId, isActive: true },
          select: { id: true },
        })
      : null;
    if (data.defaultRoomId && !room)
      throw new AppError("VALIDATION", "請選擇本店可使用的教室");
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
    const data = courseScheduleInput
      .extend({ sourceSessionId: z.string().min(1).optional() })
      .parse(input);
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
        const source = data.sourceSessionId
          ? await tx.courseSession.findFirst({
              where: { id: data.sourceSessionId, storeId, cancelledAt: null },
            })
          : null;
        if (
          data.sourceSessionId &&
          (!source || source.templateId !== data.templateId)
        )
          throw new AppError(
            "VALIDATION",
            "找不到可複製的本店課程，請重新整理",
          );
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
            nameSnapshot: source?.nameSnapshot ?? template.name,
            roomId: room.id,
            coachId: data.coachId,
            pointCost: source?.pointCost ?? template.pointCost,
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

/** Reversible catalogue visibility. Session snapshots and history are never deleted. */
export async function setCourseCatalogStatus(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const data = z
      .object({
        id: z.string().min(1).max(100),
        kind: z.enum(["room", "template"]),
        isActive: z.boolean(),
      })
      .parse(input);
    await coursePrisma.$transaction(async (tx) => {
      const stores = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
      if (!stores.length)
        throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
      const result =
        data.kind === "room"
          ? await tx.courseRoom.updateMany({
              where: { id: data.id, storeId },
              data: { isActive: data.isActive },
            })
          : await tx.courseTemplate.updateMany({
              where: { id: data.id, storeId },
              data: { isActive: data.isActive },
            });
      if (!result.count)
        throw new AppError("NOT_FOUND", "找不到本店資料，請重新整理");
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/hq/dashboard/courses");
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function previewCourseSchedule(input: unknown) {
  try {
    const { storeId } = await writableStore();
    const d = courseScheduleInput.parse(input);
    const dates = buildCourseOccurrences(d);
    const [conflicts, room] = await Promise.all([
      coursePrisma.courseSession.findMany({
        where: {
          storeId,
          cancelledAt: null,
          AND: [
            { OR: [{ roomId: d.roomId }, { coachId: d.coachId }] },
            {
              OR: dates.map((r) => ({
                startsAt: { lt: r.endsAt },
                endsAt: { gt: r.startsAt },
              })),
            },
          ],
        },
        select: { startsAt: true, endsAt: true, roomId: true },
      }),
      coursePrisma.courseRoom.findFirst({
        where: { id: d.roomId, storeId },
        select: { capacity: true },
      }),
    ]);
    return {
      success: true as const,
      data: {
        dates: dates.map((r) => ({
          startsAt: r.startsAt.toISOString(),
          conflict: conflicts.some(
            (c) => c.startsAt < r.endsAt && c.endsAt > r.startsAt,
          ),
        })),
        capacityWarning:
          room?.capacity && d.capacity > room.capacity
            ? `排課 ${d.capacity} 人超過教室容納 ${room.capacity} 人，請確認容量`
            : null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function updateCourseSeries(input: unknown) {
  try {
    const { storeId } = await writableStore("booking.update");
    const d = courseScheduleInput
      .omit({ templateId: true, requestKey: true, repeatUntil: true })
      .extend({
        id: z.string().min(1),
        nameSnapshot: z.string().trim().min(1).max(80),
        pointCost: z.number().int().min(1).max(10000),
      })
      .parse(input);
    const [range] = buildCourseOccurrences({
      ...d,
      additionalDates: undefined,
      templateId: "series",
      requestKey: "00000000-0000-4000-8000-000000000000",
    });
    const { courseTransaction } =
      await import("@/server/services/course-access");
    await courseTransaction(storeId, async (tx) => {
      const source = await tx.courseSession.findFirst({
        where: { id: d.id, storeId, cancelledAt: null },
      });
      if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
      const [room, coaches, sessions] = await Promise.all([
        tx.courseRoom.findFirst({
          where: { id: d.roomId, storeId, isActive: true },
        }),
        tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Staff" WHERE id = ${d.coachId} AND "storeId" = ${storeId} AND status::text = 'ACTIVE'`,
        tx.courseSession.findMany({
          where: {
            storeId,
            requestKey: source.requestKey,
            startsAt: { gte: source.startsAt },
            cancelledAt: null,
          },
          include: { bookings: { where: { status: { not: "CANCELLED" } } } },
          orderBy: { startsAt: "asc" },
        }),
      ]);
      if (!room || !coaches.length)
        throw new AppError("VALIDATION", "請選擇本店啟用的教室與教練");
      const shift = range.startsAt.getTime() - source.startsAt.getTime();
      const changes = sessions.map((s) => ({
        session: s,
        startsAt: new Date(s.startsAt.getTime() + shift),
        endsAt: new Date(
          s.startsAt.getTime() + shift + d.durationMinutes * 60000,
        ),
      }));
      for (const change of changes) {
        if (
          change.session.bookings.length > d.capacity ||
          (change.session.bookings.length &&
            change.session.pointCost !== d.pointCost)
        )
          throw new AppError(
            "CONFLICT",
            "後續課程已有預約，容量或點數修改不適用；整批尚未修改",
          );
        const conflict = await tx.courseSession.findFirst({
          where: {
            storeId,
            id: { notIn: sessions.map((s) => s.id) },
            cancelledAt: null,
            startsAt: { lt: change.endsAt },
            endsAt: { gt: change.startsAt },
            OR: [{ roomId: d.roomId }, { coachId: d.coachId }],
          },
        });
        if (
          conflict ||
          changes.some(
            (other) =>
              other !== change &&
              other.startsAt < change.endsAt &&
              other.endsAt > change.startsAt,
          )
        )
          throw new AppError(
            "CONFLICT",
            `${formatTWDateTime(change.startsAt)} 撞期，整批尚未修改`,
          );
      }
      // Exclusion constraints are immediate. Temporarily release only these
      // rows inside the same transaction; other writers use the store lock.
      await tx.courseSession.updateMany({
        where: { storeId, id: { in: sessions.map((s) => s.id) } },
        data: { cancelledAt: new Date() },
      });
      for (const c of changes)
        await tx.courseSession.update({
          where: { id: c.session.id },
          data: {
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            roomId: d.roomId,
            coachId: d.coachId,
            pointCost: d.pointCost,
            capacity: d.capacity,
            nameSnapshot: d.nameSnapshot,
            cancelledAt: null,
          },
        });
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
