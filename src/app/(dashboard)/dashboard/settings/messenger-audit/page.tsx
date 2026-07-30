import { notFound } from "next/navigation";
import { PageHeader, PageShell } from "@/components/desktop";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import { MessengerAuditPanel } from "./messenger-audit-panel";
import { ConversationResetPanel } from "./conversation-reset-panel";
import { FlowV13PublishPanel } from "./flow-v13-publish-panel";

export default async function MessengerAuditPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) notFound();
  if (!(await checkPermission(user.role, user.staffId, "plans.edit"))) notFound();

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
  if (store?.slug !== "zhubei") notFound();

  return (
    <PageShell className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-4">
      <PageHeader
        title="Messenger 連線稽核"
        subtitle="唯讀檢查 Meta App、Page、Webhook 與訂閱狀態；結果不含任何憑證。"
      />
      <MessengerAuditPanel storeId={storeId} />
      {user.role === "OWNER" ? <FlowV13PublishPanel /> : null}
      <ConversationResetPanel />
    </PageShell>
  );
}
