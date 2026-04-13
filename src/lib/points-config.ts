import type { PointType } from "@prisma/client";

/**
 * Phase B 完整版積分配置
 */
export const POINT_VALUES: Record<PointType, number> = {
  REFERRAL_CREATED: 10,      // 轉介紹登記
  REFERRAL_VISITED: 20,      // 被介紹人到店
  REFERRAL_CONVERTED: 30,    // 被介紹人成為顧客
  ATTENDANCE: 5,             // 出席（Booking COMPLETED）
  BECAME_PARTNER: 100,       // 升為合作店長
  REFERRAL_PARTNER: 100,     // 自己推薦的人升為合作店長
  SERVICE: 5,                // 完成服務
  SERVICE_NOTE: 3,           // 寫服務紀錄
  BECAME_FUTURE_OWNER: 200,  // 升為準店長
  MANUAL_ADJUSTMENT: 0,      // 手動調整（由操作者指定）
};

export const POINT_LABELS: Record<PointType, string> = {
  REFERRAL_CREATED: "轉介紹登記",
  REFERRAL_VISITED: "被介紹人到店",
  REFERRAL_CONVERTED: "被介紹人成為顧客",
  ATTENDANCE: "出席",
  BECAME_PARTNER: "成為合作店長",
  REFERRAL_PARTNER: "推薦的人成為合作店長",
  SERVICE: "完成服務",
  SERVICE_NOTE: "服務紀錄",
  BECAME_FUTURE_OWNER: "成為準店長",
  MANUAL_ADJUSTMENT: "手動調整",
};
