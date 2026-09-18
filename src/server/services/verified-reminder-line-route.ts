import { prisma } from "@/lib/db";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import {
  probeSteamButlerLineRecipient,
  probeStoreLineRecipient,
} from "@/lib/line";
import {
  resolveReminderLineRoute,
  type ReminderLineRoute,
} from "@/server/services/reminder-line-route";
import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

/**
 * A legacy Customer.lineUserId may have come from central LINE Login rather
 * than the booking store's webhook. Verify it against the store channel before
 * selecting STORE. A definitive mismatch falls back to the verified central
 * recipient; an upstream outage fails closed instead of guessing.
 */
export async function resolveVerifiedReminderLineRoute(
  storeId: string,
  legacyStoreLineUserId: string | null,
  centralRecipient: CentralLineRecipientResolution | null | undefined,
  customerId?: string,
): Promise<ReminderLineRoute> {
  const config = getConfiguredStoreLine(storeId);
  if (config) {
    const blocked = (reason: string): ReminderLineRoute => ({ status: "BLOCKED", channel: null, recipientLineUserId: null, reason });
    if (!customerId || config.storeId !== storeId) return blocked("STORE_LINE_MEMBERSHIP_REQUIRED");
    const provider = storeLineIdentityProvider(config);
    const links = await prisma.customerIdentityLink.findMany({
      where: { storeId, customerId, provider, customer: { storeId, mergedIntoCustomerId: null, lineLinkStatus: { not: "BLOCKED" } }, user: { status: "ACTIVE" } },
      select: { userId: true, providerAccountId: true }, take: 2,
    });
    if (links.length !== 1) return blocked("STORE_LINE_IDENTITY_UNCONFIRMED");
    const link = links[0];
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: link.providerAccountId } },
      select: { userId: true },
    });
    if (!account || account.userId !== link.userId) return blocked("STORE_LINE_ACCOUNT_CONFLICT");
    const probe = await probeStoreLineRecipient(storeId, link.providerAccountId);
    if (probe.status !== "COMPATIBLE") return blocked("STORE_LINE_NOT_MESSAGING_REACHABLE");
    return { status: "READY", channel: "STORE", recipientLineUserId: link.providerAccountId };
  }
  const candidate = legacyStoreLineUserId?.trim();
  if (!candidate) return resolveVerifiedCentralReminderLineRoute(centralRecipient);

  const probe = await probeStoreLineRecipient(storeId, candidate);
  if (probe.status === "COMPATIBLE") {
    return resolveReminderLineRoute(candidate, centralRecipient);
  }
  if (probe.status === "INCOMPATIBLE") {
    return resolveVerifiedCentralReminderLineRoute(centralRecipient);
  }
  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: `store_channel_verification_unavailable:${probe.httpStatus ?? "network"}`,
  };
}

/**
 * Account(provider="line") proves LINE Login ownership, not Messaging API
 * reachability. Verify it against the central bot before using it as a push
 * recipient; this prevents a misleading "linked" state from becoming two
 * guaranteed 400 attempts across unrelated LINE providers.
 */
export async function resolveVerifiedCentralReminderLineRoute(
  centralRecipient: CentralLineRecipientResolution | null | undefined,
): Promise<ReminderLineRoute> {
  const candidate = centralRecipient?.deliverable
    ? centralRecipient.recipientLineUserId?.trim()
    : null;
  if (!candidate) return resolveReminderLineRoute(null, centralRecipient);

  const probe = await probeSteamButlerLineRecipient(candidate);
  if (probe.status === "COMPATIBLE") {
    return {
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: candidate,
    };
  }
  if (probe.status === "INCOMPATIBLE") {
    return {
      status: "BLOCKED",
      channel: null,
      recipientLineUserId: null,
      reason: "CENTRAL_LINE_NOT_MESSAGING_REACHABLE",
    };
  }
  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: `central_channel_verification_unavailable:${probe.httpStatus ?? "network"}`,
  };
}
