import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

export type ReminderLineRoute =
  | {
      status: "READY";
      channel: "STORE";
      recipientLineUserId: string;
    }
  | {
      status: "READY";
      channel: "CENTRAL";
      recipientLineUserId: string;
    }
  | {
      status: "BLOCKED";
      channel: null;
      recipientLineUserId: null;
      reason: string;
    };

/**
 * Select exactly one compatible Messaging API channel and recipient.
 *
 * A LINE userId is channel/provider scoped. A store-channel id must therefore
 * be sent with that store's token, while a central LINE Login id must be sent
 * with the SteamButler central token.
 */
export function resolveReminderLineRoute(
  legacyStoreLineUserId: string | null,
  centralRecipient: CentralLineRecipientResolution | null | undefined,
): ReminderLineRoute {
  const legacyRecipient = legacyStoreLineUserId?.trim();
  if (legacyRecipient) {
    return {
      status: "READY",
      channel: "STORE",
      recipientLineUserId: legacyRecipient,
    };
  }

  if (centralRecipient?.deliverable && centralRecipient.recipientLineUserId) {
    return {
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: centralRecipient.recipientLineUserId,
    };
  }

  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: centralRecipient?.status ?? "CUSTOMER_NOT_FOUND",
  };
}
