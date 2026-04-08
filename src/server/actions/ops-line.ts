"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { pushMessage } from "@/lib/line";
import { handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

/**
 * Send a LINE message to a customer from ops dashboard context.
 * Logs the message in MessageLog for audit trail.
 */
export async function sendOpsLineMessage(
  customerId: string,
  messageText: string,
): Promise<ActionResult<{ messageLogId: string }>> {
  try {
    const user = await requireStaffSession();

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        lineUserId: true,
        lineLinkStatus: true,
      },
    });

    if (!customer) {
      return { success: false, error: "顧客不存在" };
    }
    if (!customer.lineUserId || customer.lineLinkStatus !== "LINKED") {
      return { success: false, error: "此顧客尚未綁定 LINE" };
    }

    // Send via LINE Push API
    const result = await pushMessage(customer.lineUserId, [
      { type: "text", text: messageText },
    ]);

    // Log the message
    const log = await prisma.messageLog.create({
      data: {
        customerId: customer.id,
        channel: "LINE",
        status: result.success ? "SENT" : "FAILED",
        renderedBody: messageText,
        errorMessage: result.error ?? null,
        sentAt: result.success ? new Date() : null,
      },
    });

    revalidatePath("/dashboard/ops");

    if (!result.success) {
      return { success: false, error: result.error ?? "LINE 發送失敗" };
    }

    return { success: true, data: { messageLogId: log.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * Send a LINE message to a customer by their ops action refId.
 * Used from customer-actions and alerts sections.
 */
export async function sendOpsLineByRefId(
  refId: string,
  customerId: string,
  messageText: string,
): Promise<ActionResult<{ messageLogId: string }>> {
  // Delegate to the main function — refId is used for UI tracking only
  return sendOpsLineMessage(customerId, messageText);
}
