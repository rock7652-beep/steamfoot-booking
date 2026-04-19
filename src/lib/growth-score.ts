/**
 * Growth System v2 — score / tags / nextAction 純函式
 *
 * 設計原則：
 * - 完全無 DB 呼叫、無 async；所有資料由 caller 準備好再傳入
 * - 公式與閾值全部可解釋，能在 UI 展開 breakdown 說明
 * - 易測：同輸入永遠同輸出
 *
 * 公式（0-100 整數）：
 *   readinessBase = readinessScore × 0.5                              // 0-50
 *   recencyScore  = min(recent30dBookings × 3 + recent30dReferralEvents × 5, 30)  // 0-30
 *   pointsScore   = totalPoints ≥ 100 ? 10 : totalPoints ≥ 50 ? 5 : 0          // 0-10
 *   stageScore    = FUTURE_OWNER=10 / PARTNER=5 / 其他=0                       // 0-10
 *   growthScore   = round(readinessBase + recencyScore + pointsScore + stageScore)
 */

import type { TalentStage } from "@prisma/client";
import {
  GROWTH_STATUS_TAG_DEFS,
  NEXT_ACTION_DEFS,
  type GrowthScoreBreakdown,
  type GrowthScoreV2,
  type GrowthStatusTag,
  type GrowthStatusTagId,
  type NextAction,
  type NextActionId,
  type ReadinessLevel,
} from "@/types/talent";

// ============================================================
// Growth Score
// ============================================================

export interface GrowthScoreInput {
  readinessScore: number; // 0-100 舊制
  recent30dBookings: number;
  recent30dReferralEvents: number;
  totalPoints: number;
  talentStage: TalentStage;
}

export function computeGrowthScoreV2(input: GrowthScoreInput): GrowthScoreV2 {
  const readinessBase = clamp(input.readinessScore * 0.5, 0, 50);
  const rawRecency = input.recent30dBookings * 3 + input.recent30dReferralEvents * 5;
  const recencyScore = clamp(rawRecency, 0, 30);
  const pointsScore =
    input.totalPoints >= 100 ? 10 : input.totalPoints >= 50 ? 5 : 0;
  const stageScore =
    input.talentStage === "FUTURE_OWNER"
      ? 10
      : input.talentStage === "PARTNER"
      ? 5
      : 0;

  const breakdown: GrowthScoreBreakdown = {
    readinessBase: round(readinessBase),
    recencyScore: round(recencyScore),
    pointsScore,
    stageScore,
  };
  const score = clamp(
    Math.round(readinessBase + recencyScore + pointsScore + stageScore),
    0,
    100,
  );
  return { score, breakdown };
}

// ============================================================
// Status Tags
// ============================================================

export interface GrowthStatusInput {
  growthScore: number;
  readinessLevel: ReadinessLevel;
  isEligibleForFutureOwner: boolean;
  talentStage: TalentStage;
  recent30dBookings: number;
  recent30dReferralEvents: number;
  cumulativeReferrals: number;
  cumulativeConverted: number;
  daysSinceLastVisit: number | null; // null → 從未到店或資料缺
  /** 本月 growthScore Top 10 的 customerId — 用來標 monthly_focus。由 query 端預先計算填入 */
  isMonthlyFocus: boolean;
}

export function computeGrowthStatusTags(input: GrowthStatusInput): GrowthStatusTag[] {
  const ids: GrowthStatusTagId[] = [];

  if (input.growthScore >= 60) ids.push("high_potential");

  if (
    input.readinessLevel === "HIGH" ||
    input.readinessLevel === "READY" ||
    input.isEligibleForFutureOwner
  ) {
    ids.push("near_promotion");
  }

  const isStageCandidate =
    input.talentStage === "PARTNER" || input.talentStage === "FUTURE_OWNER";
  const isVisitStale = input.daysSinceLastVisit == null || input.daysSinceLastVisit > 30;
  if (isStageCandidate && isVisitStale && input.recent30dReferralEvents === 0) {
    ids.push("stagnant");
  }

  if (input.recent30dReferralEvents >= 3) ids.push("referral_active");

  if (
    input.cumulativeConverted >= 3 &&
    input.cumulativeReferrals > 0 &&
    input.cumulativeConverted / input.cumulativeReferrals >= 0.5
  ) {
    ids.push("referral_quality");
  }

  if (input.growthScore >= 70 || input.readinessLevel === "READY") {
    ids.push("worth_a_talk");
  }

  if (input.isMonthlyFocus) ids.push("monthly_focus");

  return ids.map((id) => ({ id, ...GROWTH_STATUS_TAG_DEFS[id] }));
}

// ============================================================
// Next Action
// ============================================================

export interface NextActionInput {
  talentStage: TalentStage;
  readinessLevel: ReadinessLevel;
  totalPoints: number;
  cumulativeReferrals: number;
  cumulativeConverted: number;
  recent30dBookings: number;
  recent30dReferralEvents: number;
  recent30dConverted: number;
  daysSinceLastVisit: number | null;
}

/**
 * first-match 規則評估，永遠回傳一個 NextAction（最差 fallback = "維持關係"）
 */
export function getNextGrowthAction(input: NextActionInput): NextAction {
  const id = pickNextActionId(input);
  return { id, ...NEXT_ACTION_DEFS[id] };
}

function pickNextActionId(input: NextActionInput): NextActionId {
  // 1. FUTURE_OWNER 接近開店門檻 → 安排培育對話
  if (
    input.talentStage === "FUTURE_OWNER" &&
    input.totalPoints >= 100 &&
    input.cumulativeConverted >= 2
  ) {
    return "schedule_owner_talk";
  }

  // 2. 停滯（合作/準店長且 30 天無到店與無推薦） → 主動聯繫
  const isStageCandidate =
    input.talentStage === "PARTNER" || input.talentStage === "FUTURE_OWNER";
  const isVisitStale = input.daysSinceLastVisit == null || input.daysSinceLastVisit > 30;
  if (isStageCandidate && isVisitStale && input.recent30dReferralEvents === 0) {
    return "check_in";
  }

  // 3. 近期推薦但未轉化 → 追蹤推薦名單
  if (input.recent30dReferralEvents >= 2 && input.recent30dConverted === 0) {
    return "follow_up_referrals";
  }

  // 4. PARTNER 且 readiness 偏高且有轉化 → 邀請對談
  if (
    input.talentStage === "PARTNER" &&
    (input.readinessLevel === "HIGH" || input.readinessLevel === "READY") &&
    input.cumulativeConverted >= 2
  ) {
    return "invite_partner_talk";
  }

  // 5. 積分夠但推薦不足 → 推動轉介紹
  if (input.totalPoints >= 100 && input.cumulativeConverted < 2) {
    return "push_for_referral";
  }

  // 6. 到店穩定但無推薦 → 邀請分享
  if (input.recent30dBookings >= 4 && input.recent30dReferralEvents === 0) {
    return "invite_share";
  }

  // 7. fallback
  return "maintain";
}

// ============================================================
// helpers
// ============================================================

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round(n: number): number {
  return Math.round(n);
}
