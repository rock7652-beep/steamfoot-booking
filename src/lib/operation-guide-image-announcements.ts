import type { OperationGuide } from "./operation-guide-types";
export const imageAnnouncementGuides: OperationGuide[] = [{
  id: "IMG01", category: "hours", title: "如何在首頁放課表或營業時間圖片？",
  summary: "在圖片公告上傳、排序及排程圖片，再儲存發布。",
  answer: "開啟「圖片公告」，上傳 JPG 或 PNG，選填顯示日期，最後儲存。",
  keywords: "圖片公告 課表 月課表 營業時間 行銷 圖片上傳 輪播 上下架 A4 兩欄 三欄 全螢幕 店家公告",
  path: "店務管理 → 圖片公告",
  steps: ["確認目前門市，點「上傳圖片」，最多保留 5 張。", "拖曳或使用上下箭頭排序；點「編輯」設定日期及啟用狀態。", "點「儲存」，確認顯示「已儲存 ✓」。"],
  important: "公告只提供圖片資訊，不會變更實際預約時段、課程或名額。圖片只在目前門市使用，不會跨店發布。",
  success: "有效圖片出現在該門市前台首頁，顧客可點擊放大。",
  details: ["上架日期留空代表立即，下架日期留空代表不限；日期依台灣時間計算，下架當日仍可顯示。", "建議 A4 比例；其他比例保留完整內容，不裁切、不拉伸，透明背景會補白。", "JPG／PNG 上傳前自動壓縮；解析度偏低會提醒，儲存前確認文字清晰。", "管理清單在一般桌機以兩欄、寬螢幕以三欄排列；編輯時上下架日期並排，窄畫面維持單欄，不需縮小文字。", "圖片自動顯示於目前門市首頁的「店家公告」，不需選擇模組；顧客點圖後使用全螢幕檢視與左右切換。這是後台設定效果說明，不另建立前台操作文章。更換或刪除圖片，儲存前仍可取消變更。"],
  modules: ["steamfoot", "course", "beauty"], permission: "business_hours.view", additionalPermissions: ["business_hours.manage"], feature: null, kind: "howto", verification: "source-reviewed",
  sources: ["src/app/(dashboard)/dashboard/image-announcements/page.tsx", "src/components/image-announcements/manager.tsx", "src/components/image-announcements/carousel.tsx", "src/app/api/image-announcements/route.ts", "src/app/api/image-announcements/[id]/route.ts"],
}];
