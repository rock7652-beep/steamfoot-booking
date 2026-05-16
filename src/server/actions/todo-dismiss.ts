"use server";

/**
 * dismissTodo — 首頁待處理「我已知悉」(PR-149)
 *
 * 店長把首頁某筆待處理勾掉 → 寫一筆 TodoDismiss(userId, todoKey)。
 *
 * 嚴格邊界：
 *   - per-user：以 session user.id 為 key，店長 A dismiss 不影響店長 B
 *   - 只寫 TodoDismiss；不動 Customer / Wallet / Transaction / Booking 任何狀態
 *   - 不影響顧客 LINE / email 提醒（reminder-engine 不讀 TodoDismiss）
 *   - upsert：重複 dismiss 同一筆為 no-op（idempotent）
 *   - todoKey 由 store-todos 產生，狀態變 → key 變 → 舊 dismiss 自動失效
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

const VALID_TODO_TYPES = [
  "PAYMENT",
  "BOOKING",
  "FOLLOW_UP",
  "LOW_SESSIONS",
] as const;

export async function dismissTodo(input: {
  todoKey: string;
  todoType: string;
}): Promise<ActionResult> {
  try {
    const user = await requireStaffSession();

    const todoKey = (input.todoKey ?? "").trim();
    const todoType = (input.todoType ?? "").trim();
    if (!todoKey) {
      return { success: false, error: "缺少 todoKey" };
    }
    if (!VALID_TODO_TYPES.includes(todoType as (typeof VALID_TODO_TYPES)[number])) {
      return { success: false, error: "未知的待辦類型" };
    }

    // storeId 純 metadata（無 FK）：OWNER/PARTNER 用 session.storeId；
    // ADMIN 跨店檢視時 todo 可能跨店，用 sentinel 標記，安全性靠 userId
    const storeId = user.storeId ?? "__admin_cross_store__";

    await prisma.todoDismiss.upsert({
      where: { userId_todoKey: { userId: user.id, todoKey } },
      create: { userId: user.id, storeId, todoKey, todoType },
      update: {}, // 已 dismiss 過 → no-op
    });

    revalidatePath("/dashboard");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * Form-action 包裝 — 給 server component 內 `<form action={...}>` 用。
 * 失敗不丟（避免整頁 error boundary）；revalidatePath 已在 dismissTodo 內處理，
 * 失敗時該筆就維持顯示，店長可再點一次。
 */
export async function dismissTodoFormAction(formData: FormData): Promise<void> {
  await dismissTodo({
    todoKey: String(formData.get("todoKey") ?? ""),
    todoType: String(formData.get("todoType") ?? ""),
  });
}
