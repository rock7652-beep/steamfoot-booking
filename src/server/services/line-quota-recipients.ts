import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";

/** Resolve current store memberships; never use the visiting HQ user's email. */
export async function getLineQuotaOwnerRecipients(storeId: string) {
  const owners = await prisma.staff.findMany({
    where: { storeId, status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } },
    select: { user: { select: { email: true } } },
  });
  const emails = new Set<string>();
  let missingEmailCount = 0;
  for (const owner of owners) {
    const result = z.string().trim().email().max(254).safeParse(owner.user.email);
    if (result.success) emails.add(result.data.toLowerCase());
    else missingEmailCount++;
  }
  return { emails: [...emails].sort(), missingEmailCount, ownerCount: owners.length };
}

/** Separate per-address events permit partial retry without resending successful mail. */
export function quotaRecipientEventKey(eventKey: string, email: string) {
  return `${eventKey}:recipient:${createHash("sha256").update(email).digest("hex")}`;
}
