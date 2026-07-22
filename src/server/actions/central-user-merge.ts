"use server";

import { revalidatePath } from "next/cache";
import { AppError, handleActionError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { executeCentralUserMerge } from "@/server/services/central-user-merge";
import type { ActionResult } from "@/types";

export async function executeCentralUserMergeAction(input: {
  sourceUserId: string;
  targetUserId: string;
  confirmation: string;
}): Promise<ActionResult<{ movedAccounts: number; movedLinks: number; checkedCustomers: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") throw new AppError("FORBIDDEN", "僅限總部管理員執行");
    if (input.confirmation.trim() !== "確認整合") throw new AppError("VALIDATION", "請輸入「確認整合」");
    const plan = await executeCentralUserMerge({
      sourceUserId: input.sourceUserId.trim(),
      targetUserId: input.targetUserId.trim(),
      actorUserId: user.id,
    });
    revalidatePath("/dashboard/central-user-merges");
    revalidatePath("/dashboard/member-link-reviews");
    return { success: true, data: {
      movedAccounts: plan.moves.accounts,
      movedLinks: plan.moves.identityLinks,
      checkedCustomers: plan.verification.checkedCustomerRecords,
    } };
  } catch (error) {
    return handleActionError(error);
  }
}
