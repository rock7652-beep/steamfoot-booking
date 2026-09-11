"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import type { ActionResult } from "@/types";

const editWalletExpirySchema = z.object({
  walletId: z.string().min(1, "缺少 walletId"),
  newExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "到期日格式需為 YYYY-MM-DD")
    .refine((s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    }, "到期日不是有效日期"),
  reason: z.string().trim().min(1, "請填寫修改原因").max(500, "原因過長"),
});

/**
 * 編輯顧客已指派方案的到期日。
 *
 * - ACTIVE / EXPIRED 可修改；USED_UP / CANCELLED 不可修改。
 * - 可提前或延後，但不得早於台灣今天。
 * - EXPIRED 改成今天或未來日期時恢復 ACTIVE。
 * - 不動堂數、價格、開始日與交易紀錄，只寫 AuditLog。
 */
export async function editWalletExpiry(
  input: z.infer<typeof editWalletExpirySchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("wallet.adjust");
    const data = editWalletExpirySchema.parse(input);

    const wallet = await prisma.customerPlanWallet.findUnique({
      where: { id: data.walletId },
      select: {
        id: true,
        customerId: true,
        storeId: true,
        status: true,
        expiryDate: true,
      },
    });
    if (!wallet) throw new AppError("NOT_FOUND", "課程錢包不存在");
    assertStoreAccess(user, wallet.storeId);

    if (wallet.status !== "ACTIVE" && wallet.status !== "EXPIRED") {
      throw new AppError(
        "BUSINESS_RULE",
        "此方案狀態無法修改到期日（已用完或已註銷）",
      );
    }
    if (!wallet.expiryDate) {
      throw new AppError("BUSINESS_RULE", "此方案目前為無期限，暫不提供日期修改");
    }

    const todayTW = toLocalDateStr();
    const currentExpiryStr = wallet.expiryDate.toISOString().slice(0, 10);

    if (data.newExpiryDate < todayTW) {
      throw new AppError("VALIDATION", "到期日不可早於今天");
    }
    if (data.newExpiryDate === currentExpiryStr) {
      throw new AppError("VALIDATION", "新的到期日與目前相同，無需修改");
    }

    const newExpiry = parseTaiwanDateToDbDate(data.newExpiryDate);
    const nextStatus = wallet.status === "EXPIRED" ? "ACTIVE" : wallet.status;

    await prisma.$transaction(async (tx) => {
      await tx.customerPlanWallet.update({
        where: { id: wallet.id },
        data: {
          expiryDate: newExpiry,
          status: nextStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "CustomerPlanWallet",
          targetId: wallet.id,
          action: "EDIT_EXPIRY",
          beforeJson: {
            expiryDate: currentExpiryStr,
            status: wallet.status,
          },
          afterJson: {
            expiryDate: data.newExpiryDate,
            status: nextStatus,
            direction: data.newExpiryDate > currentExpiryStr ? "EXTEND" : "SHORTEN",
            reason: data.reason,
          },
        },
      });
    });

    revalidatePath(`/dashboard/customers/${wallet.customerId}`);
    revalidatePath("/my-plans");
    revalidatePath("/book");
    revalidatePath("/liff");
    revalidatePath("/liff/wallets");
    revalidatePath("/liff/member-booking");

    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
