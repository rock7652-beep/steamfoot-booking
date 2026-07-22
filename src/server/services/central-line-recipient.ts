export type CentralLineRecipientStatus =
  | "READY"
  | "NO_CENTRAL_USER"
  | "CENTRAL_USER_CONFLICT"
  | "CENTRAL_USER_INACTIVE"
  | "NO_CENTRAL_LINE"
  | "CENTRAL_LINE_CONFLICT"
  | "IDENTITY_LINK_CONFLICT"
  | "LEGACY_LINE_CONFLICT";

export interface CentralLineRecipientInput {
  customerId: string;
  directUserId: string | null;
  legacyLineUserId: string | null;
  identityLinks: Array<{
    userId: string;
    provider: string;
    providerAccountId: string;
    lineUserId: string | null;
  }>;
  users: Array<{
    id: string;
    status: string;
    accounts: Array<{ provider: string; providerAccountId: string }>;
  }>;
}

export interface CentralLineRecipientResolution {
  customerId: string;
  status: CentralLineRecipientStatus;
  deliverable: boolean;
  centralUserId: string | null;
  recipientLineUserId: string | null;
  maskedRecipient: string | null;
}

function maskLineUserId(value: string | null): string | null {
  if (!value || value.length < 8) return null;
  return `${value.slice(0, 1)}******${value.slice(-4)}`;
}

/**
 * Resolve one store Customer to the single central LINE Login account.
 *
 * Fail-closed contract:
 * - Customer.userId and verified identity links may identify the central User;
 * - phone/name/email never participate;
 * - the recipient always comes from Account(provider="line"), never a legacy field;
 * - every legacy/identity-link LINE value must agree with that account;
 * - conflicts return no recipient so callers cannot accidentally send.
 */
export function resolveCentralLineRecipient(
  input: CentralLineRecipientInput,
): CentralLineRecipientResolution {
  const base = {
    customerId: input.customerId,
    deliverable: false,
    centralUserId: null,
    recipientLineUserId: null,
    maskedRecipient: null,
  };
  const centralUserIds = new Set([
    ...(input.directUserId ? [input.directUserId] : []),
    ...input.identityLinks.map((link) => link.userId),
  ]);
  if (centralUserIds.size === 0) return { ...base, status: "NO_CENTRAL_USER" };
  if (centralUserIds.size !== 1) return { ...base, status: "CENTRAL_USER_CONFLICT" };

  const centralUserId = [...centralUserIds][0];
  const user = input.users.find((candidate) => candidate.id === centralUserId);
  if (!user || user.status !== "ACTIVE") {
    return { ...base, centralUserId, status: "CENTRAL_USER_INACTIVE" };
  }

  const accountLineIds = new Set(
    user.accounts
      .filter((account) => account.provider === "line")
      .map((account) => account.providerAccountId.trim())
      .filter(Boolean),
  );
  if (accountLineIds.size === 0) {
    return { ...base, centralUserId, status: "NO_CENTRAL_LINE" };
  }
  if (accountLineIds.size !== 1) {
    return { ...base, centralUserId, status: "CENTRAL_LINE_CONFLICT" };
  }

  const recipientLineUserId = [...accountLineIds][0];
  const linkedLineIds = new Set(
    input.identityLinks
      .filter((link) => link.provider === "line")
      .flatMap((link) => [link.providerAccountId, link.lineUserId])
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim()),
  );
  if ([...linkedLineIds].some((value) => value !== recipientLineUserId)) {
    return { ...base, centralUserId, status: "IDENTITY_LINK_CONFLICT" };
  }
  if (
    input.legacyLineUserId?.trim() &&
    input.legacyLineUserId.trim() !== recipientLineUserId
  ) {
    return { ...base, centralUserId, status: "LEGACY_LINE_CONFLICT" };
  }

  return {
    customerId: input.customerId,
    status: "READY",
    deliverable: true,
    centralUserId,
    recipientLineUserId,
    maskedRecipient: maskLineUserId(recipientLineUserId),
  };
}
