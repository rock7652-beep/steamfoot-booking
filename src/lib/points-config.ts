import type { PointType } from "@prisma/client";

/**
 * MVP 第一版積分配置
 * 只啟用 5 種 type，其餘第二階段再加
 */
export const POINT_VALUES: Record<PointType, number> = {
  REFERRAL_CREATED: 10,   // 轉介紹登記
  REFERRAL_VISITED: 20,   // 被介紹人到店
  REFERRAL_CONVERTED: 30, // 被介紹人成為顧客
  ATTENDANCE: 5,          // 出席（Booking COMPLETED）
  BECAME_PARTNER: 100,    // 升為合作店長
};

export const POINT_LABELS: Record<PointType, string> = {
  REFERRAL_CREATED: "轉介紹登記",
  REFERRAL_VISITED: "被介紹人到店",
  REFERRAL_CONVERTED: "被介紹人成為顧客",
  ATTENDANCE: "出席",
  BECAME_PARTNER: "成為合作店長",
};
