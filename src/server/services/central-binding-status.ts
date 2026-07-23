export type CentralBindingStatus =
  | "COMPLETE"
  | "NEEDS_LINE"
  | "NEEDS_MEMBER_LINK"
  | "NEEDS_LOGIN";

export interface CentralBindingEvidence {
  hasVerifiedMemberLink: boolean;
  hasCentralUser: boolean;
  hasCentralLine: boolean;
}

export function resolveCentralBindingStatus(
  evidence: CentralBindingEvidence,
): CentralBindingStatus {
  if (!evidence.hasCentralUser) return "NEEDS_LOGIN";
  if (!evidence.hasVerifiedMemberLink) return "NEEDS_MEMBER_LINK";
  if (!evidence.hasCentralLine) return "NEEDS_LINE";
  return "COMPLETE";
}

