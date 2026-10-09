"use server";

import { z } from "zod";
import { redactAuditValue } from "@/lib/audit-redact";
import { getCurrentUser } from "@/lib/session";
import { resolveOperationAuditScope } from "@/server/services/store-operation-audit-access";
import { readStoreOperationAudits } from "@/server/services/store-operation-audit-reader";
import { isStoreAuditTarget } from "@/lib/store-operation-audit-policy";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { AppError, handleActionError } from "@/lib/errors";
import { resolveAuditPresentation } from "@/server/services/audit-presentation";
import type { AuditReferences } from "@/lib/audit-presentation";
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
  actorRoleSnapshot?: string | null;
  source?: string;
  targetLabel?: string;
  references?: AuditReferences;
  beforeJson: unknown;
  afterJson: unknown;
  actor: { id?: string; name: string; role: string };
};

export async function loadOperationHistory(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<OperationHistoryItem[]>> {
  try {
    const current = await getCurrentUser();
    const scope = current ? await resolveOperationAuditScope(current) : null;
    if (!scope) throw new AppError("FORBIDDEN", "無權查看操作紀錄");
    const user = await requirePermission(scope.hq ? "audit.read" : "store.audit.read");
    if (!scope.hq) {
      const data = inputSchema.parse(input);
      if (!isStoreAuditTarget(data.targetType)) throw new AppError("FORBIDDEN", "無權查看此類紀錄");
      const result = await readStoreOperationAudits({ storeId: scope.storeId, ...data });
      return { success: true, data: result.items };
    }
    const storeId = await resolveWriteStoreId(user);
    assertStoreAccess(user, storeId);
    const data = inputSchema.parse(input);
    const history = await getOperationHistory({ storeId, ...data });
    const presentation = await resolveAuditPresentation(history.map(item=>({...item,storeId,targetType:data.targetType,targetId:data.targetId})), { hq: user.role === "ADMIN" });
    return {
      success: true,
      data: history.map((item) => ({ ...item, targetLabel: presentation.get(item.id)?.target, references: presentation.get(item.id)?.references, beforeJson: redactAuditValue(item.beforeJson), afterJson: redactAuditValue(item.afterJson), createdAt: item.createdAt.toISOString() })),
    };
  } catch (error) {
    return handleActionError(error);
  }
}
