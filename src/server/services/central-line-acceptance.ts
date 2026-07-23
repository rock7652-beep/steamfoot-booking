import type {
  CentralLineRecipientResolution,
  CentralLineRecipientStatus,
} from "@/server/services/central-line-recipient";

export type CentralLineAcceptanceBucket =
  | "ACCEPTED"
  | "CUSTOMER_ACTION_REQUIRED"
  | "MANUAL_REVIEW_REQUIRED";

export const CENTRAL_LINE_ACCEPTANCE_LABEL: Record<CentralLineAcceptanceBucket, string> = {
  ACCEPTED: "已通過中央 LINE 驗收",
  CUSTOMER_ACTION_REQUIRED: "待顧客完成中央綁定",
  MANUAL_REVIEW_REQUIRED: "身份衝突，需人工處理",
};

const CUSTOMER_ACTION_STATUSES = new Set<CentralLineRecipientStatus>([
  "NO_CENTRAL_USER",
  "NO_CENTRAL_LINE",
]);

export function classifyCentralLineAcceptance(
  resolution: Pick<CentralLineRecipientResolution, "status" | "deliverable" | "recipientLineUserId">,
): CentralLineAcceptanceBucket {
  if (
    resolution.status === "READY" &&
    resolution.deliverable &&
    resolution.recipientLineUserId
  ) {
    return "ACCEPTED";
  }
  if (CUSTOMER_ACTION_STATUSES.has(resolution.status)) {
    return "CUSTOMER_ACTION_REQUIRED";
  }
  return "MANUAL_REVIEW_REQUIRED";
}

export function buildCentralLineAcceptanceSummary(
  resolutions: Array<
    Pick<CentralLineRecipientResolution, "status" | "deliverable" | "recipientLineUserId">
  >,
) {
  const counts: Record<CentralLineAcceptanceBucket, number> = {
    ACCEPTED: 0,
    CUSTOMER_ACTION_REQUIRED: 0,
    MANUAL_REVIEW_REQUIRED: 0,
  };
  for (const resolution of resolutions) {
    counts[classifyCentralLineAcceptance(resolution)] += 1;
  }
  return {
    counts,
    conflictFree: counts.MANUAL_REVIEW_REQUIRED === 0,
    fullyDeliverable:
      resolutions.length > 0 && counts.ACCEPTED === resolutions.length,
  };
}
