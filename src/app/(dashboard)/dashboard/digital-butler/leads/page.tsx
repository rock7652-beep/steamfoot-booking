import { notFound } from "next/navigation";
import type { DigitalButlerLeadStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import type { DigitalButlerProviderFilter } from "@/lib/digital-butler-provider";
import { PageHeader, PageShell } from "@/components/desktop";
import {
  listDigitalButlerLeads,
  listDigitalButlerLeadStaff,
} from "@/server/queries/digital-butler-leads";
import { DigitalButlerLeadList } from "./lead-list";

export const dynamic = "force-dynamic";

const STATUSES = new Set<DigitalButlerLeadStatus>([
  "NEW",
  "CONTACTING",
  "QUOTED",
  "WON",
  "LOST",
  "PAUSED",
]);
const PROVIDER_FILTERS = new Set<DigitalButlerProviderFilter>(["LINE", "MESSENGER", "INSTAGRAM", "WEB", "OTHER"]);

interface PageProps {
  searchParams: Promise<{
    status?: string;
    staff?: string;
    provider?: string;
    leadId?: string;
    support?: string;
  }>;
}

export default async function DigitalButlerLeadsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireDigitalButlerEntitlement(storeId).catch(() => notFound());

  const params = await searchParams;
  const status = STATUSES.has(params.status as DigitalButlerLeadStatus)
    ? (params.status as DigitalButlerLeadStatus)
    : undefined;
  const provider = PROVIDER_FILTERS.has(params.provider as DigitalButlerProviderFilter)
    ? (params.provider as DigitalButlerProviderFilter)
    : undefined;
  const unassignedHumanSupport = params.support === "unassigned";
  const [leads, staff] = await Promise.all([
    listDigitalButlerLeads(storeId, {
      status,
      assignedStaffId: params.staff || undefined,
      provider,
      leadId: params.leadId || undefined,
      unassignedHumanSupport,
    }),
    listDigitalButlerLeadStaff(storeId),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="數位管家名單"
        subtitle="查看各來源流程完成名單、分派負責人並記錄後續結果"
      />
      <DigitalButlerLeadList
        leads={leads}
        staff={staff}
        selectedStatus={status ?? ""}
        selectedStaffId={params.staff ?? ""}
        selectedProvider={provider ?? ""}
      />
    </PageShell>
  );
}
