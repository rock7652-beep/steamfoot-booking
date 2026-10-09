import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261009: OperationGuide[] = [
  {
    id: "C168",
    category: "hours",
    title: "如何暫停或恢復學員自行預約？",
    summary: "關閉後只暫停會員新增預約、改期、加入候補及自動遞補；既有課表、預約、方案與順位保留。",
    answer: "在營業與預約關閉「允許學員自行預約」並儲存；店家與教練原有操作、取消及帳務規則不變。",
    keywords: "允許學員自行預約 暫停預約 關閉預約 改期 候補 自動遞補 恢復預約",
    path: "設定 → 營業與預約 → 允許學員自行預約",
    steps: [
      "展開「允許學員自行預約」，取消勾選並按「儲存」；看到已儲存後再關閉設定面板。",
      "用會員前台核對仍能查看課表、既有預約、方案與候補順位，但不能新增預約、改期或加入候補。",
      "需要恢復時重新勾選並儲存；後續有取消或名額變動時，系統才會再依原順位處理候補。"
    ],
    important: "關閉不會取消既有預約、重排候補、改方案額度或發通知；自動遞補會在處理前停下。切換本身也不會批次補跑。",
    success: "設定列顯示正確開啟／關閉狀態；會員端限制與保留項目符合說明，店家協助預約與點名仍可用。",
    details: [
      "會員仍可取消既有預約與退出候補；付款、核帳、收款、點名及教練工作不受這個開關改寫。",
      "多人同行、具名共卡成員與體驗改期都套用同一個會員自助限制；店家後台代約仍依原權限與規則。",
      "若提示設定已由其他人更新，重新整理確認目前狀態後再儲存，不要覆蓋較新的設定。"
    ],
    modules: ["course"],
    permission: "business_hours.manage",
    feature: null,
    sources: [
      "docs/course-self-booking-switch-20261008.md",
      "src/app/(dashboard)/dashboard/courses/course-self-booking-settings.tsx",
      "src/server/actions/course-settings.ts",
      "src/server/services/course-booking.ts"
    ],
    verification: "source-reviewed",
    kind: "howto"
  },
  {
    id: "I19",
    category: "settings",
    title: "HQ 如何管理需求諮詢與體驗版開通申請？",
    summary: "同一入口分成需求諮詢與正式開通兩階段；先核對原始資料，再以人工方式關聯。",
    answer: "需求諮詢不會自動建店、發通知或與同名同電話資料合併；正式開通資料仍須另外提交並由 HQ 人工核對。",
    keywords: "HQ 諮詢 體驗申請 需求諮詢 正式開通 人工關聯 狀態 聯繫紀錄 原有 Sheet",
    path: "HQ → 店舖管理 → 諮詢與體驗申請",
    steps: [
      "用階段、狀態或搜尋篩選清單，先核對店家、聯絡人、需求、狀態、建議下一步與原始送出時間。",
      "展開需求諮詢，查看原始需求、聯絡偏好及官網／社群連結；測試紀錄或選擇暫不考慮者不要主動聯繫。",
      "記錄處理進度與聯繫內容；收到正式體驗版開通資料後，核對完整編號再人工關聯，不以名稱或電話猜測。"
    ],
    important: "限 HQ ADMIN 且需 staff.manage。歷史 Sheet 尚未自動匯入；需求諮詢與正式開通沒有自動匹配，也不會自動建立門市或發外部通知。",
    success: "清單篩選與狀態正確，活動紀錄保留操作人與時間；人工關聯指向核對過的正式申請。",
    details: [
      "需求諮詢可只留電話或 LINE 其中一種；網站、Facebook、Instagram 可選填，格式不正確時先查核再開啟。",
      "清單以六項摘要呈現並分頁；變更搜尋、階段或狀態會重設頁碼與目前展開項目。",
      "若 HQ 需求諮詢尚未啟用或隔離資料庫未確認，畫面會停止讀取並提示改查原有 Sheet，不應假稱沒有收到資料。"
    ],
    modules: ["steamfoot", "spa", "course"],
    permission: "staff.manage",
    feature: null,
    sources: [
      "docs/consultation-hq-local-plan.md",
      "docs/consultation-release-plan.md",
      "docs/hq-intake-list-review.md",
      "src/app/hq/dashboard/trial-applications/page.tsx",
      "src/app/hq/dashboard/trial-applications/consultation-list.tsx"
    ],
    verification: "source-reviewed",
    kind: "howto"
  }
];
