import type { ReferralStatus } from "@prisma/client";

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  PENDING: "待確認",
  VISITED: "已到店",
  CONVERTED: "已轉顧客",
  CANCELLED: "已取消",
};

export const REFERRAL_STATUS_CONFIG: Record<
  ReferralStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: "待確認", color: "text-earth-500", bg: "bg-earth-100" },
  VISITED: { label: "已到店", color: "text-blue-600", bg: "bg-blue-100" },
  CONVERTED: { label: "已轉顧客", color: "text-green-700", bg: "bg-green-100" },
  CANCELLED: { label: "已取消", color: "text-red-600", bg: "bg-red-100" },
};

/** 可從目前狀態轉換到的下一步 */
export const REFERRAL_STATUS_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  PENDING: ["VISITED", "CANCELLED"],
  VISITED: ["CONVERTED", "CANCELLED"],
  CONVERTED: [],  // 終態
  CANCELLED: [],  // 終態
};

export interface ReferralWithReferrer {
  id: string;
  referrerId: string;
  referrerName: string;
  referredName: string;
  referredPhone: string | null;
  status: ReferralStatus;
  convertedCustomerId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface ReferralStats {
  totalThisMonth: number;
  pendingCount: number;
  visitedCount: number;
  convertedCount: number;
}
