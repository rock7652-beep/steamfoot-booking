import "server-only";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { isHqStoreView } from "@/lib/hq-store-view";
import { assertAiPreview } from "../../../scripts/ai-digital-butler-preview-scope.mjs";
import { aiButlerDatabase } from "./database";
import { brandManagement } from "./brand-management-core";

export function brandManagementRuntime() {
  assertAiPreview();
  return brandManagement({ database: aiButlerDatabase(), assertPreview: () => assertAiPreview(), secret: process.env.AI_IDENTITY_SECRET ?? "", env: process.env,
    actor: async () => { const user = await requirePermission("audit.read"); return { id: user.id, role: user.role,
      auditAllowed: await checkPermission(user.role,user.staffId,"audit.read"), storeView: await isHqStoreView(user) }; },
  });
}
export function brandManagementError(error: unknown) {
  const code=error instanceof Error?error.message:"";
  const errors: Record<string,string> = {
    AI_SETTING_CONFLICT:"設定已更新，本次未儲存。請重新載入核對。",
    AI_BRAND_AUDIT_NOT_READY:"安全稽核尚未就緒，本次未儲存。請洽管理者核對。",
    AI_BRAND_TEST_LIMIT:"本輪 Mock 測試已達 8 筆上限，請核對帳本。",
    AI_BRAND_READ_ONLY:"目前為唯讀驗收，尚未允許此操作。",
    AI_NOT_ENTITLED:"品牌服務尚未開通，請先核對 HQ 授權。",
    AI_GLOBAL_STOPPED:"AI 總停止仍生效，不能啟用或建立測試請求。",
    AI_BRAND_REVIEW_REQUIRED:"請先審核目前已儲存版本，再發布知識。",
    AI_KNOWLEDGE_CONFLICT:"版本已變更，草稿仍保留；請重新載入核對。",
    AI_HANDOFF_CONFLICT:"對話狀態已變更，請重新整理核對。",
    AI_HANDOFF_REVIEW_REQUIRED:"仍有處理中或未知事件，暫不能恢復。",
    AI_HANDOFF_SCOPE_CHANGED:"帳號或工作區已變更，請重新開啟。",
    AI_BRAND_AUDITED_RESUME_REQUIRED:"請至待人工清單核對並恢復對話。",
  };
  return { success:false as const,uncertain:!errors[code],error:errors[code]??"品牌操作尚未確認，請核對權限與最新資料後重試。" };
}
