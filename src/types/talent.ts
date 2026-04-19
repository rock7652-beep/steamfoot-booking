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

// ============================================================
// Growth System v2 — Phase A
// ============================================================

export interface GrowthScoreBreakdown {
  /** 0-50：readinessScore × 0.5，長期沉澱 */
  readinessBase: number;
  /** 0-30：30 天活躍度（出席×3 + 推薦事件×5，cap 30） */
  recencyScore: number;
  /** 0-10：行動積分 bucket（0 / 5 / 10） */
  pointsScore: number;
  /** 0-10：階段加權（FUTURE_OWNER=10 / PARTNER=5 / 其他=0） */
  stageScore: number;
}

export interface GrowthScoreV2 {
  /** 0-100 整數 */
  score: number;
  breakdown: GrowthScoreBreakdown;
}

export type GrowthStatusTagId =
  | "high_potential" // 高潛力
  | "near_promotion" // 接近升級
  | "stagnant" // 停滯中
  | "referral_active" // 推薦活躍
  | "referral_quality" // 推薦品質高
  | "worth_a_talk" // 值得約談
  | "monthly_focus"; // 本月重點追蹤

export interface GrowthStatusTag {
  id: GrowthStatusTagId;
  label: string;
  /** tailwind bg class */
  color: string;
  /** tailwind text class */
  textColor: string;
  description: string;
}

export const GROWTH_STATUS_TAG_DEFS: Record<GrowthStatusTagId, Omit<GrowthStatusTag, "id">> = {
  high_potential: {
    label: "高潛力",
    color: "bg-amber-100",
    textColor: "text-amber-700",
    description: "綜合成長分數高，具備培養潛力",
  },
  near_promotion: {
    label: "接近升級",
    color: "bg-green-100",
    textColor: "text-green-700",
    description: "readiness 或升級條件接近達標",
  },
  stagnant: {
    label: "停滯中",
    color: "bg-red-100",
    textColor: "text-red-700",
    description: "30 天無推薦、無到店，需主動關心",
  },
  referral_active: {
    label: "推薦活躍",
    color: "bg-blue-100",
    textColor: "text-blue-700",
    description: "近 30 天有持續推薦行動",
  },
  referral_quality: {
    label: "推薦品質高",
    color: "bg-purple-100",
    textColor: "text-purple-700",
    description: "累積轉化率高，介紹來的人留下",
  },
  worth_a_talk: {
    label: "值得約談",
    color: "bg-orange-100",
    textColor: "text-orange-700",
    description: "成長分數或 readiness 達高點，建議當面談",
  },
  monthly_focus: {
    label: "本月重點",
    color: "bg-primary-100",
    textColor: "text-primary-700",
    description: "本月綜合成長分數 Top 10",
  },
};

export type NextActionId =
  | "schedule_owner_talk" // 安排店長培育對話
  | "check_in" // 主動聯繫確認狀況
  | "follow_up_referrals" // 追蹤推薦名單
  | "invite_partner_talk" // 邀請合作夥伴對談
  | "push_for_referral" // 推動轉介紹
  | "invite_share" // 邀請分享體驗
  | "maintain"; // 維持關係，觀察動向

export interface NextAction {
  id: NextActionId;
  label: string;
  /** 為何是這個建議（給店長看的一句說明） */
  reason: string;
}

export const NEXT_ACTION_DEFS: Record<NextActionId, Omit<NextAction, "id">> = {
  schedule_owner_talk: { label: "安排店長培育對話", reason: "已接近 FUTURE_OWNER 門檻" },
  check_in: { label: "主動聯繫確認狀況", reason: "30 天無到店 / 推薦行動" },
  follow_up_referrals: { label: "追蹤推薦名單", reason: "近期有推薦但尚未轉化" },
  invite_partner_talk: { label: "邀請合作夥伴對談", reason: "長期活躍且累積推薦成果" },
  push_for_referral: { label: "推動轉介紹", reason: "積分已足但推薦數不足" },
  invite_share: { label: "邀請分享體驗", reason: "到店穩定但未發起推薦" },
  maintain: { label: "維持關係，觀察動向", reason: "目前未達特定規則，建議維持常態溝通" },
};

/**
 * Growth Candidate — 成長系統 v2 候選人卡片資料（overview Top5 / 潛力名單共用）
 */
export interface GrowthCandidate {
  customerId: string;
  name: string;
  talentStage: TalentStage;
  readinessLevel: ReadinessLevel;
  readinessScore: number; // 0-100 舊制，保留次要顯示
  growthScore: number; // 0-100 新制
  breakdown: GrowthScoreBreakdown;
  totalPoints: number;
  /** 30 天內完成預約次數 */
  recent30dBookings: number;
  /** 30 天內推薦事件數（ReferralEvent，排除 CANCELLED 之狀態） */
  recent30dReferralEvents: number;
  /** 30 天內推薦已轉化（BOOKING_COMPLETED 去重顧客數） */
  recent30dConverted: number;
  /** 累積轉介數（referral 表 VISITED + CONVERTED） */
  cumulativeReferrals: number;
  /** 累積轉化數（referral 表 CONVERTED） */
  cumulativeConverted: number;
  /** 自動狀態標籤 */
  tags: GrowthStatusTag[];
  /** 下一步建議 */
  nextAction: NextAction;
  /** 最後活動日（maxOf lastVisitAt / 最後 referral event） */
  lastActionAt: Date | null;
}

export interface GrowthKpi {
  /** growthScore ≥ 60 */
  highPotentialCount: number;
  /** readinessLevel ∈ {HIGH, READY} */
  nearPromotionCount: number;
  /** 本月 ReferralEvent 所有 type 總數 */
  monthReferralEvents: number;
  /** 本月 ReferralEvent type=BOOKING_COMPLETED 去重顧客數 */
  monthConvertedReferrals: number;
  /** 本月新升為 PARTNER 人數（stageChangedAt 在本月 且 stage=PARTNER） */
  newPartnerThisMonth: number;
  /** 本月新升為 FUTURE_OWNER 人數 */
  newFutureOwnerThisMonth: number;
}

export interface GrowthOverview {
  kpi: GrowthKpi;
  /** 依 growthScore desc 排序的完整候選列表（PARTNER + FUTURE_OWNER） */
  allSorted: GrowthCandidate[];
  /** allSorted.slice(0, 5) — overview 顯示用 */
  top5: GrowthCandidate[];
  /** 停滯 tag 為 true 的候選人（limit 5） */
  stagnation: GrowthCandidate[];
  funnelStages: TalentPipelineSummary["stages"];
  /** 合作店長總數 / 未來店長總數（漏斗小摘要） */
  totalPartners: number;
  totalFutureOwners: number;
}
