import { notFound } from "next/navigation";
import type { DigitalButlerLeadStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getAccessibleStoreIds, getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
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
  searchParams: Promise<{ status?: string; staff?: string; provider?: string; handoff?: string; leadId?: string }>;
}

export default async function DigitalButlerLeadsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) notFound();
  const params = await searchParams;
  const activeStoreId = await getActiveStoreForRead(user);
  const focusedLead = params.leadId
    ? await prisma.digitalButlerLead.findFirst({
        where: {
          id: params.leadId,
          storeId: { in: await getAccessibleStoreIds(user) },
        },
        select: { storeId: true },
      })
    : null;
  const storeId = focusedLead?.storeId ?? activeStoreId;
  if (!storeId) notFound();
  await requireDigitalButlerEntitlement(storeId).catch(() => notFound());

  const status = STATUSES.has(params.status as DigitalButlerLeadStatus)
    ? (params.status as DigitalButlerLeadStatus)
    : undefined;
  const provider = PROVIDER_FILTERS.has(params.provider as DigitalButlerProviderFilter)
    ? (params.provider as DigitalButlerProviderFilter)
    : undefined;
  const waitingForHumanSupport = params.handoff === "waiting";
  const [leads, staff] = await Promise.all([
    listDigitalButlerLeads(storeId, {
      status,
      assignedStaffId: params.staff || undefined,
      provider,
      waitingForHumanSupport,
      focusedLeadId: params.leadId || undefined,
    }),
    listDigitalButlerLeadStaff(storeId),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="數位管家名單"
        subtitle="查看顧客需求、指派負責人並更新處理進度"
      />
      <DigitalButlerLeadList
        resolvedStoreId={storeId}
        leads={leads}
        staff={staff}
        selectedStatus={status ?? ""}
        selectedStaffId={params.staff ?? ""}
        selectedProvider={provider ?? ""}
        waitingForHumanSupport={waitingForHumanSupport}
        focusedLeadId={params.leadId ?? null}
      />
    </PageShell>
  );
}
