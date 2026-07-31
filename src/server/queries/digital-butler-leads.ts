import type { DigitalButlerLeadStatus, DigitalButlerProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptDigitalButlerValue } from "@/lib/digital-butler-crypto";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import type { DigitalButlerProviderFilter } from "@/lib/digital-butler-provider";
import { HUMAN_SUPPORT_COMPLETION_ACTION_KEY } from "@/server/services/human-support-handoff";

const STORED_PROVIDERS: DigitalButlerProvider[] = ["LINE", "MESSENGER", "INSTAGRAM"];

export async function listDigitalButlerLeads(
  storeId: string,
  filters: {
    status?: DigitalButlerLeadStatus;
    assignedStaffId?: string;
    provider?: DigitalButlerProviderFilter;
    waitingForHumanSupport?: boolean;
  } = {},
) {
  await requireDigitalButlerEntitlement(storeId);
  const leads = await prisma.digitalButlerLead.findMany({
    where: {
      storeId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assignedStaffId ? { assignedStaffId: filters.assignedStaffId } : {}),
      ...(filters.waitingForHumanSupport
        ? {
            completionActionKey: HUMAN_SUPPORT_COMPLETION_ACTION_KEY,
            status: "NEW",
            assignedStaffId: null,
          }
        : {}),
      ...(filters.provider === "OTHER"
        ? { conversation: { provider: { notIn: STORED_PROVIDERS } } }
        // WEB is deliberately retained as a UI/filter value for future inbound support.
        // The current provider enum has no WEB member, so it safely returns no rows.
        : filters.provider === "WEB"
          ? { id: { in: [] } }
          : filters.provider
            ? { conversation: { provider: filters.provider } }
            : {}),
    },
    select: {
      id: true,
      status: true,
      submittedAnswers: true,
      phoneCiphertext: true,
      phoneIv: true,
      phoneAuthTag: true,
      internalNote: true,
      lastContactedAt: true,
      createdAt: true,
      updatedAt: true,
      flow: { select: { name: true } },
      conversation: { select: { provider: true } },
      assignedStaff: { select: { id: true, displayName: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          contactedAt: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return leads.map((lead) => ({
    ...lead,
    phone:
      lead.phoneCiphertext && lead.phoneIv && lead.phoneAuthTag
        ? decryptDigitalButlerValue({
            ciphertext: Buffer.from(lead.phoneCiphertext),
            iv: Buffer.from(lead.phoneIv),
            authTag: Buffer.from(lead.phoneAuthTag),
            keyVersion: "v1",
          })
        : null,
    phoneCiphertext: undefined,
    phoneIv: undefined,
    phoneAuthTag: undefined,
  }));
}

export async function listDigitalButlerLeadStaff(storeId: string) {
  return prisma.staff.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { id: true, displayName: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}
