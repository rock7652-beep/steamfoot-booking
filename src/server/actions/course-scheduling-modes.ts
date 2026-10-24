"use server";
import { schedulingModeInput } from "@/lib/course-scheduling-mode-save";
import { courseSchedulingModes } from "@/lib/course-scheduling-modes";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { AppError, handleActionError } from "@/lib/errors";
import { settingsSaveUncertain } from "@/server/services/settings-save-error";
import { revalidatePath } from "next/cache";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
export async function saveCourseSchedulingMode(input: unknown) {
  try {
    const d = schedulingModeInput.parse(input);
    const { user, storeId } = await courseManager("business_hours.manage");
    if (storeId !== d.expectedStoreId) throw new AppError("CONFLICT", "門市已切換，請重新開啟設定");
    await assertStoreSubscriptionWritable(storeId);
    const data = await courseTransaction(storeId, async tx => {
      const before = await tx.courseBookingRule.findUnique({ where: { storeId } });
      const modes = courseSchedulingModes(before);
      const key = d.mode === "OPEN" ? "open" : "assigned";
      const revision = before?.selfBookingRevision ?? 0;
      if (modes[key] === d.enabled) return { ...modes, revision };
      if (revision !== d.expectedRevision) throw new AppError("CONFLICT", "排課模式已更新，請重新開啟核對");
      const field = d.mode === "OPEN" ? "selfBookingEnabled" : "assignedSchedulingEnabled";
      const saved = await tx.courseBookingRule.upsert({ where: { storeId }, create: { storeId, [field]: d.enabled, selfBookingRevision: 1 }, update: { [field]: d.enabled, selfBookingRevision: { increment: 1 } } });
      await enqueueOperationAudit({ actorUserId: user.id, actorNameSnapshot: user.name, storeId, module: "COURSE", targetType: "CourseBookingRule", targetId: storeId, action: "UPDATE_SCHEDULING_MODE", summary: `${d.enabled ? "開啟" : "關閉"}${d.mode === "OPEN" ? "開放選課" : "指定學員"}，既有課程與帳務保留`, before: modes, after: courseSchedulingModes(saved) }, tx);
      return { ...courseSchedulingModes(saved), revision: saved.selfBookingRevision };
    });
    let syncWarning = false;
    try { revalidatePath("/dashboard", "layout"); revalidatePath("/book"); } catch { syncWarning = true; }
    return { success: true as const, storeId, data, syncWarning };
  } catch (error) {
    const r = handleActionError(error);
    return { success: false as const, error: r.success ? "設定儲存失敗" : r.error, uncertain: settingsSaveUncertain(error) };
  }
}
