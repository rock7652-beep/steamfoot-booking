import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261023: OperationGuide[] = [
  {
    id: "F13",
    category: "care",
    title: "LINE 訊息額度快用完時，如何設定 Email 通知？",
    summary: "LINE 額度達 80%、95% 或用完時，系統會通知本店所有啟用中老闆的登入 Email，並寄送每日失敗摘要。",
    answer: "到提醒管理的店長通知查看收件信箱、額度狀態與通知預覽；通知預設開啟，可由具權限人員修改或寄測試信。",
    path: "設定 → 通知與顧客經營 → 提醒管理 → 店長通知 → LINE 額度 Email 通知 → 進階",
    keywords: "LINE 額度 Email 電子郵件 80% 95% 用完 每日失敗摘要 老闆信箱 收件信箱 測試信 垃圾郵件 共用LINE 分店LINE 美業 店長通知 額度通知 系統暫停 全站停送 推播 回覆 delivery_paused 核准恢復時間 舊事件不補發",
    steps: [
      "進入提醒管理，切到「店長通知」，找到「LINE 額度 Email 通知」並核對目前為開啟或尚未開啟，以及有效老闆信箱數。",
      "展開「收件信箱與通知預覽」，確認本店所有啟用中老闆的登入 Email；有缺漏時先到人員管理補齊，不要把私人信箱寫進備註代替。",
      "需要調整時點「修改」，勾選或取消「開啟額度通知與每日失敗摘要」後儲存；重新開啟核對狀態。寄測試信時，請各位老闆另查收件匣與垃圾郵件。",
    ],
    important: "系統接受測試信不代表每位老闆已收到或閱讀；預覽環境不會實際寄信。Email 通知不會增加 LINE 額度、改用其他 LINE 帳號或重送顧客訊息。",
    success: "開關、收件信箱數與重新開啟結果一致；測試信另由每位老闆確認實際收件，不以畫面成功代替送達。",
    details: [
  "LINE 外發改依核准切換時間控管：時間未設定、格式無效或尚未到時仍停送；已恢復也只送符合時間及偏好的新事件，不補送舊佇列。LINE 入站身分處理另行核對，不能因沒有回覆就重複綁定；見 F14。",
  "美業也在提醒管理的店長通知查看 LINE 額度 Email 通知；它與獨立技師通知分頁分開。唯讀模式不提供修改，通知信的查紀錄連結會導回美業本店發送紀錄，仍需正常登入與權限。",
  "ACTIVE／TRIAL 的營業店家預設開啟；明確關閉後不會被排程重新打開。展示、封存及非營運店家不納入。",
  "收件人固定取本店所有啟用中的老闆登入 Email，沒有手動指定欄位；停用、離店、角色或信箱變更後會依最新資料重新核對。地址會去除空白、統一小寫並去重。",
  "每個地址分開記錄結果，一位寄送失敗不會把其他老闆的成功改成失敗。測試信五分鐘內不重複申請；畫面顯示寄信服務已接受後，仍須確認實際信箱。",
  "分店 LINE 與共用 LINE 分開計算；共用帳號的用量可能包含其他店家。收到警示先確認 LINE 方案及剩餘額度，共用 LINE 由蒸管家統一處理。",
  "每日失敗摘要是前一個完整台灣營業日的失敗紀錄數，可能包含重試，不等於未收到通知的顧客人數；請回發送紀錄確認後續是否成功。",
  "具 business_hours.manage 且門市已開通 LINE 提醒者才可操作。此功能只管理通知信，不改預約、顧客、扣堂、收款或原 LINE 發送規則。",
  "LINE 額度 Email 位於店長通知的進階區，與所選通知收件人的個別 LINE 開關分開。"
],
    modules: ["steamfoot", "course", "beauty"],
    permission: "business_hours.manage",
    feature: "line_reminder",
    kind: "howto",
    verification: "source-reviewed",
    sources: [
  "src/app/(dashboard)/dashboard/reminders/line-quota-email-setting.tsx",
  "src/server/actions/line-quota-notifications.ts",
  "src/app/(dashboard)/dashboard/beauty/reminders/page.tsx",
  "src/server/services/line-quota-monitor.ts",
  "src/server/services/line-quota-recipients.ts",
  "src/server/services/line-quota-settings.ts",
  "docs/line-quota-email-alerts.md",
  "src/lib/line-delivery-pause.ts",
  "src/lib/line.ts"
],
  },
];
