"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type CentralMemberLinkReviewState = {
  error: string | null;
  success: boolean;
};

const allowedTypes = new Set(["NOT_MY_MEMBERSHIP", "UNLINK_REQUEST"]);

export async function requestCentralMemberLinkReviewAction(
  _previous: CentralMemberLinkReviewState,
  formData: FormData,
): Promise<CentralMemberLinkReviewState> {
  const session = await requireSession();
  if (session.role !== "CUSTOMER") return { error: "只有顧客帳號可以提出申請", success: false };

  const storeId = String(formData.get("storeId") ?? "");
  const rawType = String(formData.get("type") ?? "");
  if (!storeId || !allowedTypes.has(rawType)) return { error: "申請資料不完整，請重新操作", success: false };
  const type = rawType as "NOT_MY_MEMBERSHIP" | "UNLINK_REQUEST";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const links = await tx.customerIdentityLink.findMany({
        where: { userId: session.id, storeId },
        select: { id: true, customerId: true },
      });
      const customerIds = new Set(links.map((link) => link.customerId));
      if (links.length === 0 || customerIds.size !== 1) return { status: "invalid" } as const;

      const identityLink = links[0];
      const existing = await tx.centralMemberLinkReviewRequest.findFirst({
        where: { userId: session.id, storeId, status: "PENDING" },
        select: { id: true },
      });
      if (existing) return { status: "existing" } as const;

      const request = await tx.centralMemberLinkReviewRequest.create({
        data: {
          userId: session.id,
          storeId,
          customerId: identityLink.customerId,
          identityLinkId: identityLink.id,
          type,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          targetType: "CentralMemberLinkReviewRequest",
          targetId: request.id,
          action: "CREATE",
          afterJson: { storeId, type, status: "PENDING" },
        },
      });
      return { status: "created" } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status === "invalid") return { error: "這間門市的會員連結無法安全確認，請聯繫店家", success: false };
    revalidatePath("/", "layout");
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      revalidatePath("/", "layout");
      return { error: null, success: true };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "申請正在處理中，請稍後重新整理", success: false };
    }
    console.error("[central-member-link-review] create failed", { userId: session.id, storeId, error });
    return { error: "目前無法送出申請，請稍後再試", success: false };
  }
}
