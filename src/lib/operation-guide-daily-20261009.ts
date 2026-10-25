import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261009: OperationGuide[] = [
  {
    id: "C168",
    category: "hours",
    title: "如何設定開放選課與指定學員？",
    summary: "兩個排課模式可獨立開關；關閉後保留既有課表、方案、帳務與候補順位。",
    answer: "到營業與預約的「排課模式」，切換開放選課或指定學員；確認畫面顯示已儲存的狀態。",
    keywords: "排課模式 開放選課 指定學員 允許學員自行預約 暫停預約 關閉預約 改期 候補 自動遞補 恢復預約",
    path: "設定 → 營業與預約 → 排課模式",
    steps: ["分別切換開放選課、指定學員；兩者可以同時開啟。", "關閉開放選課後不再新增該模式課程，會員不能新增選課或加入候補，自動遞補暫停；既有紀錄保留。", "關閉指定學員後不再新增該模式排課；既有課堂仍可查看、依原規則請假、補課及更正。"],
    important: "切換不會取消舊課、重排候補、改額度或發通知；空間租借另依租借規則。恢復開啟不會立即批次補跑候補。",
    success: "兩個開關顯示正確狀態，前台與新增排課依設定呈現。",
    details: ["自行請假與自行改期仍由各自開關及原課堂規則決定。", "若提示設定已更新，重新核對目前狀態再操作；儲存結果未確認時使用重試確認。"],
    modules: ["course"],
    permission: "business_hours.manage",
    feature: null,
    sources: [
      "docs/course-self-booking-switch-20261008.md",
      "src/components/admin/course-scheduling-mode-settings.tsx",
      "src/server/actions/course-scheduling-modes.ts",
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
    keywords: "HQ 諮詢 體驗申請 需求諮詢 正式開通 人工關聯 狀態 聯繫紀錄 原有 Sheet 歷史匯入 來源與編號 電話待核對 已補前導0",
    path: "HQ → 店舖管理 → 諮詢與體驗申請",
    steps: ["用階段、狀態或搜尋篩選清單，核對店家、聯絡人、需求、狀態、下一步與原始送出時間。", "展開需求內容查看已填答欄位；完整編號與歷史匯入時間在「來源與編號」。電話標示待核對時，不要憑猜測撥打或補號。", "收到正式開通資料後核對完整編號再人工關聯；測試紀錄或暫不考慮者不要主動聯繫。"],
    important: "限 HQ ADMIN 且需 staff.manage。歷史 Sheet 僅在另行核准的固定批次人工匯入，不是全量自動同步；本頁不會自動建店、匹配或發外部通知。",
    success: "清單篩選與狀態正確，活動紀錄保留操作人與時間；人工關聯指向核對過的正式申請。",
    details: ["需求詳情省略未填答欄位；明確的否與 0 仍會顯示。少一欄不代表原資料遭刪除，需看原始內容與來源。", "歷史資料分開顯示原始送出與實際匯入時間。清單上的已匯入筆數不代表所有歷史已處理；不要自行重跑或按姓名電話合併。", "歷史數值來源電話未核對時不提供一鍵撥打；只有已保存且符合原號碼前補 0 的核准修正才顯示已補前導0，不會自行改寫其他電話。", "變更搜尋、階段或狀態會重設頁碼及展開項目。未啟用或隔離資料庫未確認時依提示停止讀取，不假稱沒有收到資料。"],
    modules: ["steamfoot", "spa", "course"],
    permission: "staff.manage",
    feature: null,
    sources: ["src/app/hq/dashboard/trial-applications/consultation-list.tsx", "src/app/hq/dashboard/trial-applications/consultation-view.ts", "src/app/hq/dashboard/trial-applications/intake-detail-fields.tsx", "src/app/hq/dashboard/trial-applications/trial-application-list.tsx", "src/lib/consultation-legacy-import.ts"],
    verification: "source-reviewed",
    kind: "howto"
  }
];
