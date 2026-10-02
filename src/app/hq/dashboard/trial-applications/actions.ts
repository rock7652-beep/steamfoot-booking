"use server";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { applicationStatuses } from "@/lib/trial-application";
import { notifyTrialApplication } from "@/server/services/trial-application-notification";
export async function updateApplication(form: FormData) {
  const user = await requireAdminSession();
  await requirePermission("staff.manage");
  if (!trialApplicationDatabaseAllowed())
    throw new Error("預覽收件資料庫尚未設定");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!(status in applicationStatuses)) throw new Error("無效狀態");
  await prisma.$transaction(async (tx) => {
    const previous = await tx.trialApplication.findUniqueOrThrow({
      where: { id },
    });
    await tx.trialApplication.update({ where: { id }, data: { status } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        targetType: "TrialApplication",
        targetId: id,
        action: "UPDATE",
        module: "trial-applications",
        beforeJson: { status: previous.status },
        afterJson: { status },
      },
    });
  });
  revalidatePath("/hq/dashboard/trial-applications");
}
export async function retryApplicationNotification(form: FormData) {
  await requireAdminSession();
  await requirePermission("staff.manage");
  if (!trialApplicationDatabaseAllowed())
    throw new Error("預覽收件資料庫尚未設定");
  const id = String(form.get("id") ?? "");
  const record = await prisma.trialApplication.findUniqueOrThrow({ where: { id } });
  const claimed = await prisma.trialApplication.updateMany({
    where: {
      id,
      revision: record.revision,
      notificationStatus: { in: ["FAILED", "DISABLED", "PENDING"] },
    },
    data: { notificationStatus: "SENDING" },
  });
  if (claimed.count) {
    const notificationStatus = await notifyTrialApplication(id);
    await prisma.trialApplication.updateMany({
      where: { id, revision: record.revision, notificationStatus: "SENDING" },
      data: { notificationStatus },
    });
  }
  revalidatePath("/hq/dashboard/trial-applications");
}
