"use server";

import { z } from "zod";
import { requireWritablePermission } from "@/lib/permissions";
import { currentStoreId } from "@/lib/store";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { AppError, handleActionError } from "@/lib/errors";
import { adjustCheckoutToPackage } from "@/server/actions/booking-checkout";
import { markCompleted } from "@/server/actions/booking";
import type { ActionResult } from "@/types";

const settleSpaPackageSchema = z.object({
  bookingId: z.string().min(1),
  walletId: z.string().min(1),
});

/** SPA Demo coordinator: reserve an existing treatment entitlement, then deduct it. */
export async function settleSpaBookingWithPackage(
  input: z.infer<typeof settleSpaPackageSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const user = await requireWritablePermission("booking.update");
    if (currentStoreId(user) !== SPA_DEMO_STORE.id) {
      throw new AppError("FORBIDDEN", "SPA 現場結帳目前只開放 Demo 店驗收");
    }
    const data = settleSpaPackageSchema.parse(input);
    const adjusted = await adjustCheckoutToPackage(data);
    if (!adjusted.success) throw new AppError("BUSINESS_RULE", adjusted.error);

    const completed = await markCompleted(data.bookingId);
    if (!completed.success) {
      throw new AppError(
        "CONFLICT",
        `療程已保留，但完成扣次未成功：${completed.error}。請重新開啟預約後按「完成服務」。`,
      );
    }
    return { success: true, data: { bookingId: data.bookingId } };
  } catch (error) {
    return handleActionError(error);
  }
}
