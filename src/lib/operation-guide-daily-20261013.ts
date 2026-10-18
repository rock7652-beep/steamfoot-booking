import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at main 0e01578a; signed-in acceptance is recorded separately. */
export const dailyOperationGuides20261013: OperationGuide[] = [
  {
    id: "W06",
    category: "work-orders",
    title: "工單待取件 LINE 通知怎麼開啟、確認身分與查結果？",
    summary: "先開啟待取件通知並確認顧客已完成本店會員連結；工單改為待取件後，再從工單明細核對通知結果。",
    answer: "通知資格、顧客身分與工單進度分開檢查；顯示已排入或 API 已接受也不等於顧客實機已讀。",
    path: "設定 → 通知與顧客經營 → 工單待取件通知；工單 → 明細 → LINE 連結／通知結果",
    keywords: "工單 待取件 取件通知 LINE 本店會員連結 首次確認 中央會員 QR 排入 已接受 失敗 略過 重試 確認通知連結 登入待確認",
    steps: [
      "在提醒管理開啟「工單待取件 LINE 通知」；重新開啟核對已啟用，並確認門市官方 LINE 設定可用。",
      "開啟工單明細，核對顧客與「本店會員連結」狀態。尚未連結時，請顧客掃列印單上的本店連結 QR 並完成本人確認；QR 本身不代表已綁定。",
      "依實際作業把工單改為待取件後，回原工單查看通知結果。失敗、略過或結果不明時先查原因與原紀錄，不要反覆切換進度製造重複事件。",
    ],
    important: "通知不會替店家收款、交件或更改工單內容；隔離預覽會封鎖外送，測試結果不能冒充顧客已收到 LINE。",
    success: "設定、顧客本店連結與原工單通知結果可分別核對；沒有重複通知或改動付款、庫存及取件狀態。",
    details: [
      "中央會員身分只用來協助確認本人；每間店的會員連結與通知資格仍分開保存，不會因同名、同電話或其他店已連結就自動合併。已有唯一會員可在本人核對後沿用，不另建重複帳號。",
      "只有工單顧客的「本店會員與 LINE」確實出現待確認申請時，才由具顧客修改權限者核對手機確認碼，選「已核對本人，確認通知連結」；成功即顯示已連結。登入待確認不當成有效通知連結；無待確認時不要重按或為了測試改工單進度。蒸足一般聊天室手機綁定不要求本流程的會員確認碼，課程共享官方 LINE 則仍需本店 QR 辨識門市。",
      "待取件事件具有防重識別；畫面可能顯示已排入、API 已接受、失敗或略過。API 已接受只證明平台接單，真實送達與已讀仍需在獲准的實機環境另驗。",
      "關閉設定只停止之後的新通知，不刪除工單或既有通知紀錄；重新開啟不會補發關閉期間的舊事件。",
      "列印單只有在通知功能與本店 LINE 設定符合條件時才顯示會員連結 QR；它不是一般官方 LINE 加好友 QR，也不包含顧客識別資料。",
    ],
    modules: ["steamfoot", "spa", "course"],
    permission: "work_order.read",
    feature: "work_orders",
    kind: "howto",
    verification: "source-reviewed",
    sources: [
      "src/components/admin/work-order-notification-setting.tsx",
      "src/components/admin/store-member-connection-panel.tsx",
      "src/components/admin/work-order-notification-result.tsx",
      "src/server/services/work-order-ready-notification.ts",
      "docs/store-member-link-workorder-line-20261012.md",
    ],
  },
];
