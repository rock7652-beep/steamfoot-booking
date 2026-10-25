"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";

export async function saveMusicSubject(input: unknown) {
  try {
    const data = z.object({
      id: z.string().optional(), expectedUpdatedAt: z.string().datetime().optional(),
      name: z.string().trim().min(1).max(80), durationMinutes: z.number().int().min(1).max(480),
      visibility: z.enum(["PUBLIC", "HIDDEN", "OFF"]),
      description: z.string().trim().max(5000).default(""), precautions: z.string().trim().max(5000).default(""),
    }).parse(input);
    const { storeId } = await courseManager(data.id ? "booking.update" : "booking.create");
    if (!await prisma.storeFeatureEntitlement.findFirst({ where: { storeId, featureKey: "business.music", status: "ENABLED" } }))
      throw new AppError("FORBIDDEN", "此功能僅適用音樂教室");
    await courseTransaction(storeId, async tx => {
      const values = { name: data.name, description: data.description, isActive: data.visibility !== "OFF" };
      let subjectId = data.id;
      if (subjectId) {
        const updated = await tx.musicSubject.updateMany({ where: { id: subjectId, storeId, ...(data.expectedUpdatedAt ? { updatedAt: new Date(data.expectedUpdatedAt) } : {}) }, data: values });
        if (!updated.count) throw new AppError("CONFLICT", "教學項目已有更新，請重新開啟後再編輯");
      } else subjectId = (await tx.musicSubject.create({ data: { storeId, ...values } })).id;
      const defaults = { durationMinutes: data.durationMinutes, visibility: data.visibility, description: data.description, precautions: data.precautions };
      const versions = await tx.courseTemplate.findMany({ where: { storeId, musicSubjectId: subjectId }, select: { id: true } });
      if (versions.length) await tx.courseTemplate.updateMany({ where: { storeId, musicSubjectId: subjectId }, data: defaults });
      else await tx.courseTemplate.create({ data: { storeId, musicSubjectId: subjectId, name: `${data.name} · 排課`, ...defaults, capacity: 1, pointCost: 1, musicScheduleMode: "APPOINTMENT" } });
    });
    revalidatePath("/dashboard/courses");
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
