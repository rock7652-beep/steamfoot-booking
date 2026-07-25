import { notFound } from "next/navigation";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { getAllLineOfficialAccountStatuses } from "@/server/actions/line-official-accounts";
import { LineOfficialAccountsCard } from "./line-official-accounts-card";

export default async function LineOfficialAccountsPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) notFound();

  const statuses = await getAllLineOfficialAccountStatuses();

  return (
    <PageShell className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-4">
      <PageHeader
        title="LINE 官方帳號"
        subtitle="查看各分店是否正常；需要時再重新驗證"
      />
      <LineOfficialAccountsCard initialStatuses={statuses} />
    </PageShell>
  );
}
