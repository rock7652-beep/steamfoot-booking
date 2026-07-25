import type { DigitalButlerLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptDigitalButlerValue } from "@/lib/digital-butler-crypto";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";

export async function listDigitalButlerLeads(
  storeId: string,
  filters: { status?: DigitalButlerLeadStatus; assignedStaffId?: string } = {},
) {
  await requireDigitalButlerEntitlement(storeId);
  const leads = await prisma.digitalButlerLead.findMany({
    where: {
      storeId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assignedStaffId ? { assignedStaffId: filters.assignedStaffId } : {}),
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
