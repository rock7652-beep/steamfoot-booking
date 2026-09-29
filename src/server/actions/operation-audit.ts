"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { resolveWriteStoreId } from "@/lib/store";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { AppError, handleActionError } from "@/lib/errors";
import { getOperationHistory } from "@/server/services/operation-audit";
import type { ActionResult } from "@/types";

const inputSchema = z.object({
  targetType: z.string().min(1).max(80),
  targetId: z.string().min(1).max(160),
  limit: z.number().int().min(1).max(50).optional(),
});

export type OperationHistoryItem = {
  id: string;
  action: string;
  summary: string | null;
  module: string | null;
  createdAt: string;
  actorNameSnapshot: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  actor: { id: string; name: string; role: string };
};

export async function loadOperationHistory(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<OperationHistoryItem[]>> {
  try {
    const user = await requireSession();
    if (user.role === "CUSTOMER") throw new AppError("FORBIDDEN", "無權查看操作紀錄");
    const storeId = await resolveWriteStoreId(user);
    assertStoreAccess(user, storeId);
    const data = inputSchema.parse(input);
    const history = await getOperationHistory({ storeId, ...data });
    return {
      success: true,
      data: history.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
  } catch (error) {
    return handleActionError(error);
  }
}
