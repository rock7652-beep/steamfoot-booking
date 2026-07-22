"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { bookingDateToday } from "@/lib/date-utils";

export type ReviewCentralMemberLinkState = { error: string | null; success: boolean };

export async function reviewCentralMemberLinkAction(
  _previous: ReviewCentralMemberLinkState,
  formData: FormData,
): Promise<ReviewCentralMemberLinkState> {
  const actor = await requirePermission("customer.identity.rebind");
  if (actor.role !== "ADMIN") {
    return { error: "會員資料健康檢查僅限總部管理員處理", success: false };
  }

  const storeId = await getActiveStoreForRead(actor);
  if (!storeId) return { error: "請先選擇門市", success: false };

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (!requestId || !["APPROVED", "REJECTED"].includes(decision)) {
    return { error: "審核資料不完整", success: false };
  }
  if (!reviewNote) return { error: "請填寫處理原因", success: false };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.centralMemberLinkReviewRequest.findFirst({
        where: { id: requestId, storeId },
        select: {
          id: true,
          status: true,
          type: true,
          customerId: true,
          identityLinkId: true,
          userId: true,
        },
      });
      if (!request) return { status: "not-found" } as const;
      if (request.status !== "PENDING") return { status: "already-reviewed" } as const;

      if (decision === "APPROVED" && request.type === "UNLINK_REQUEST") {
        if (!request.identityLinkId) return { status: "missing-link" } as const;
        const [activeWallets, futureBookings, exactLink] = await Promise.all([
          tx.customerPlanWallet.count({
            where: {
              storeId,
              customerId: request.customerId,
              status: "ACTIVE",
              remainingSessions: { gt: 0 },
            },
          }),
          tx.booking.count({
            where: {
              storeId,
              customerId: request.customerId,
              bookingDate: { gte: bookingDateToday() },
              bookingStatus: { in: ["PENDING", "CONFIRMED"] },
            },
          }),
          tx.customerIdentityLink.findFirst({
            where: {
              id: request.identityLinkId,
              storeId,
              customerId: request.customerId,
              userId: request.userId,
            },
            select: { id: true },
          }),
        ]);
        if (activeWallets > 0 || futureBookings > 0) {
          return { status: "blocked", activeWallets, futureBookings } as const;
        }
        if (!exactLink) return { status: "missing-link" } as const;
        await tx.customerIdentityLink.delete({ where: { id: exactLink.id } });
      }

      const status = decision as "APPROVED" | "REJECTED";
      await tx.centralMemberLinkReviewRequest.update({
        where: { id: request.id },
        data: { status, reviewNote, reviewedAt: new Date(), reviewedByUserId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          targetType: "CentralMemberLinkReviewRequest",
          targetId: request.id,
          action: status,
          beforeJson: { status: "PENDING", identityLinkId: request.identityLinkId },
          afterJson: {
            status,
            reviewNote,
            identityLinkRemoved: status === "APPROVED" && request.type === "UNLINK_REQUEST",
          },
        },
      });
      return { status: "reviewed" } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status === "not-found") return { error: "找不到這筆門市申請", success: false };
    if (result.status === "already-reviewed") return { error: "這筆申請已經處理", success: false };
    if (result.status === "missing-link") return { error: "會員連結已變更，請由總管理者確認", success: false };
    if (result.status === "blocked") {
      return {
        error: `目前不可解除：尚有 ${result.activeWallets} 個有效方案、${result.futureBookings} 筆未來預約，請由總管理者進階處理`,
        success: false,
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/member-link-reviews");
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "這筆申請正在處理，請重新整理後確認結果", success: false };
    }
    console.error("[central-member-link-review-admin] review failed", {
      actorUserId: actor.id,
      storeId,
      requestId,
      error,
    });
    return { error: "目前無法完成審核，請稍後再試", success: false };
  }
}
