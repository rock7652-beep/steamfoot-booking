import type { TalentStage } from "@prisma/client";

export type ReadinessLevel = "LOW" | "MEDIUM" | "HIGH" | "READY";

export interface ReadinessMetrics {
  referralCount: number;
  referralScore: number; // 0-25
  attendanceCount: number;
  attendanceScore: number; // 0-25
  attendanceRate: number; // 0.0-1.0
  attendanceRateScore: number; // 0-25
  daysInStage: number;
  timeScore: number; // 0-25
  /** 行動積分（參考值，不納入 readiness 分數計算） */
  totalPoints: number;
}

export interface ReadinessScore {
  customerId: string;
  customerName: string;
  talentStage: TalentStage;
  readinessLevel: ReadinessLevel;
  score: number; // 0-100
  metrics: ReadinessMetrics;
}

export interface TalentPipelineSummary {
  stages: Array<{
    stage: TalentStage;
    label: string;
    count: number;
  }>;
  totalPartners: number;
  totalFutureOwners: number;
}

export interface TalentDashboardData {
  pipeline: TalentPipelineSummary;
  readinessScores: ReadinessScore[];
  nearReady: ReadinessScore[];
}

export const TALENT_STAGE_LABELS: Record<TalentStage, string> = {
  CUSTOMER: "一般顧客",
  REGULAR: "常客",
  POTENTIAL_PARTNER: "潛在合夥人",
  PARTNER: "合作店長",
  FUTURE_OWNER: "準店長",
  OWNER: "已開店",
};

export const TALENT_STAGE_ORDER: TalentStage[] = [
  "CUSTOMER",
  "REGULAR",
  "POTENTIAL_PARTNER",
  "PARTNER",
  "FUTURE_OWNER",
  "OWNER",
];

export interface NextOwnerCandidate {
  customerId: string;
  name: string;
  talentStage: TalentStage;
  readinessScore: number;
  readinessLevel: ReadinessLevel;
  totalPoints: number;
  referralCount: number;
  referralPartnerCount: number;
  attendanceCount: number;
  daysInStage: number;
}

// ── 升級判斷 ──

export interface UpgradeProgressItem {
  met: boolean;
  current: number | string;
  required: number | string;
}

export interface UpgradeEligibility {
  isEligibleForFutureOwner: boolean;
  upgradeReasons: string[];
  upgradeProgress: {
    readiness: UpgradeProgressItem;
    points: UpgradeProgressItem;
    referrals: UpgradeProgressItem;
  };
  guidance: string[];
}

export const READINESS_LEVEL_CONFIG: Record<
  ReadinessLevel,
  { label: string; color: string; bg: string }
> = {
  LOW: { label: "初期", color: "text-earth-500", bg: "bg-earth-100" },
  MEDIUM: { label: "培養中", color: "text-blue-600", bg: "bg-blue-100" },
  HIGH: { label: "接近", color: "text-yellow-700", bg: "bg-yellow-100" },
  READY: { label: "準備就緒", color: "text-green-700", bg: "bg-green-100" },
};
