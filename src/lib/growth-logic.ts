/**
 * Growth System v2 — 純邏輯 / 常數 / 型別（非 server-only）
 *
 * 為何獨立：`src/server/queries/growth.ts` 標有 `"use server"`，Next.js 限制該類
 * 檔案只能 export async function。凡需要：
 *   - const（篩選 label map）
 *   - interface / type（list result / filter enum）
 *   - 非 async function（純運算）
 * 都收到這裡，供頁面與 query 層共同 import。
 *
 * 公式 / tag 判斷規則維持不變（沿用 `./growth-score` 與 `@/types/talent`），本檔為
 * 聚合轉出點 + 新增 list 層 API 定義。
 */

export {
  computeGrowthScoreV2,
  computeGrowthStatusTags,
  getNextGrowthAction,
  type GrowthScoreInput,
  type GrowthStatusInput,
  type NextActionInput,
} from "./growth-score";

export {
  GROWTH_STATUS_TAG_DEFS,
  NEXT_ACTION_DEFS,
} from "@/types/talent";

// ============================================================
// 潛力名單（candidates list）
// ============================================================

export type GrowthCandidateFilter =
  | "all"
  | "high_potential"
  | "near_promotion"
  | "stagnant"
  | "referral_pending" // 有推薦但未轉化
  | "partner"
  | "future_owner";

export const GROWTH_CANDIDATE_FILTER_LABELS: Record<GrowthCandidateFilter, string> = {
  all: "全部",
  high_potential: "高潛力",
  near_promotion: "接近升級",
  stagnant: "停滯中",
  referral_pending: "有推薦未轉化",
  partner: "合作夥伴",
  future_owner: "未來店長",
};

// ============================================================
// list / summary result 型別（供 query 層與 UI 共用）
// ============================================================

import type { GrowthCandidate } from "@/types/talent";
import type { ReferralStatus, TalentStage } from "@prisma/client";

export interface GrowthCandidatesListResult {
  data: GrowthCandidate[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GrowthStagnationListResult {
  data: GrowthCandidate[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GrowthReferralSummary {
  /** 本月推薦件數（status != CANCELLED） */
  totalThisMonth: number;
  /** 到店數（status in VISITED, CONVERTED） */
  visitedThisMonth: number;
  /** 轉化數（status = CONVERTED） */
  convertedThisMonth: number;
  /** 轉化率（converted / total；total=0 時為 null） */
  conversionRate: number | null;
  monthLabel: string;
}

export interface GrowthReferralListItem {
  id: string;
  referrerId: string;
  referrerName: string;
  referredName: string;
  referredPhone: string | null;
  status: ReferralStatus;
  createdAt: Date;
  convertedCustomerId: string | null;
}

export interface GrowthReferralListResult {
  data: GrowthReferralListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** 查詢使用的起算日 */
  sinceDate: Date;
}

export interface GrowthReferrerLeaderboardItem {
  customerId: string;
  name: string;
  talentStage: TalentStage;
  referralCount: number; // VISITED + CONVERTED
  convertedCount: number;
  conversionRate: number | null; // converted / (pending+visited+converted)；total=0 為 null
}
