import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at main 5b6b030a; signed-in acceptance is separate. */
export const dailyOperationGuides20261014: OperationGuide[] = [
  {
    id: "I22", category: "settings", title: "顧客、人員、預約與提醒無上限，為什麼有些功能仍不能用？",
    summary: "體驗、基本、專業與展店版都不再限制顧客、人員、每月預約及自動提醒數量；功能授權、權限與現場容量仍分開檢查。",
    answer: "無上限只移除四項系統用量限制，不代表全部功能開通、任意增加名額或 LINE 保證送達。",
    path: "設定 → 系統方案與用量 → 方案設定",
    keywords: "無上限 用量 顧客數 人員數 每月預約 自動提醒 提醒則數 數量限制 體驗版 基本版 專業版 展店版 功能未開通 隱藏 鎖定",
    steps: [
      "開啟目前門市的方案設定，核對方案與顧客、人員、每月預約、提醒的使用數；已使用數仍是統計，不是剩餘配額。",
      "某項功能不能使用時，先查實際功能授權、隱藏／鎖定、帳號權限及訂閱狀態，不因人數增加就重建帳號或另開門市。",
      "無法新增預約或提醒未送達時，另查時段／教室容量、方案可用權益、LINE 綁定、提醒開關及發送紀錄。",
    ],
    important: "門市串接數及每月報告額度沒有一起取消；進銷存、工單等加購與角色權限仍依實際授權。",
    details: [
      "四種版本的顧客、人員、每月預約與提醒限制均為無上限，舊 HQ 四項數量覆寫也不再形成阻擋；不會因此刪除既有資料或變更方案。",
      "無上限不修改扣堂、共卡、候補、撞堂、時段容量或收款規則；現場人力與課程名額仍須照原規則安排。",
      "LINE 官方帳號本身的方案／可發送量、通道及顧客綁定仍可能影響送達；隔離預覽不發實際通知。",
    ],
    success: "能分清系統用量、功能授權、帳號權限與實際容量，不把無上限誤當成全部解鎖。",
    modules: ["steamfoot", "spa", "course"], permission: "plans.edit", feature: null,
    kind: "explanation", verification: "source-reviewed",
    sources: ["src/lib/feature-flags.ts", "src/lib/reminder-send-limit.ts", "src/components/feature-gate.tsx", "src/app/(dashboard)/dashboard/settings/plan/page.tsx", "src/__tests__/unlimited-store-growth.test.ts"],
  },
];
