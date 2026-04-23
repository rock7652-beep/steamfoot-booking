import type { PointType } from "@prisma/client";

/**
 * Phase B 完整版積分配置
 *
 * 推薦獎勵設計（2026-04 版）：
 * - LINE 加入：邀請者 +1（LINE_JOIN_REFERRER）
 * - 首次完成體驗：邀請者 +10（REFERRAL_VISITED）、被邀請者 +5（REFERRAL_VISITED_SELF）
 *   — 疊加於既有 ATTENDANCE +5 之上，不取代
 * - 首次儲值/開課：邀請者 +15（REFERRAL_CONVERTED）、被邀請者 +5（REFERRAL_CONVERTED_SELF）
 * - 蒸足心得（人工）：+3（SERVICE_NOTE）
 */
export const POINT_VALUES: Record<PointType, number> = {
  REFERRAL_CREATED: 10,         // 轉介紹登記（店家手動記錄）
  REFERRAL_VISITED: 10,         // 被介紹人首次完成體驗（邀請者側）
  REFERRAL_VISITED_SELF: 5,     // 被介紹人首次完成體驗（被邀請者側）
  REFERRAL_CONVERTED: 15,       // 被介紹人首次儲值/開課（邀請者側）
  REFERRAL_CONVERTED_SELF: 5,   // 被介紹人首次儲值/開課（被邀請者側）
  LINE_JOIN_REFERRER: 1,        // 朋友透過分享加入官方 LINE（邀請者側）
  ATTENDANCE: 5,                // 出席（Booking COMPLETED）
  BECAME_PARTNER: 100,          // 升為合作店長
  REFERRAL_PARTNER: 100,        // 自己推薦的人升為合作店長
  SERVICE: 5,                   // 完成服務
  SERVICE_NOTE: 3,              // 寫服務紀錄 / 蒸足心得
  BECAME_FUTURE_OWNER: 200,     // 升為準店長
  MANUAL_ADJUSTMENT: 0,         // 手動調整（由操作者指定）
};

/**
 * 後台（staff / dashboard）看到的 labels — 保留原本較正式語彙
 */
export const POINT_LABELS: Record<PointType, string> = {
  REFERRAL_CREATED: "轉介紹登記",
  REFERRAL_VISITED: "被介紹人首次體驗",
  REFERRAL_VISITED_SELF: "首次體驗（被推薦人）",
  REFERRAL_CONVERTED: "被介紹人首次儲值",
  REFERRAL_CONVERTED_SELF: "首次儲值（被推薦人）",
  LINE_JOIN_REFERRER: "朋友加入 LINE",
  ATTENDANCE: "出席",
  BECAME_PARTNER: "成為合作店長",
  REFERRAL_PARTNER: "推薦的人成為合作店長",
  SERVICE: "完成服務",
  SERVICE_NOTE: "蒸足心得",
  BECAME_FUTURE_OWNER: "成為準店長",
  MANUAL_ADJUSTMENT: "手動調整",
};

/**
 * 顧客端（前台）看到的 labels — 白話、對齊集點方式（來店蒸足、分享給朋友…）
 * 避免「審核通過 / 任務完成 / 獎勵機制」等用詞。
 */
export const CUSTOMER_POINT_LABELS: Record<PointType, string> = {
  ATTENDANCE: "來店蒸足",
  REFERRAL_CREATED: "分享給朋友",
  REFERRAL_VISITED: "朋友完成體驗",
  REFERRAL_VISITED_SELF: "和朋友一起來體驗",
  REFERRAL_CONVERTED: "朋友開始課程",
  REFERRAL_CONVERTED_SELF: "開始自己的課程",
  LINE_JOIN_REFERRER: "朋友加入 LINE",
  SERVICE_NOTE: "分享蒸足感受",
  SERVICE: "完成服務",
  BECAME_PARTNER: "解鎖升級小禮",
  REFERRAL_PARTNER: "朋友達成里程碑",
  BECAME_FUTURE_OWNER: "解鎖 VIP 好康",
  MANUAL_ADJUSTMENT: "店家調整",
};
