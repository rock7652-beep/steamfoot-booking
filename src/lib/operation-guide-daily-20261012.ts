import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at main 9e623716; signed-in acceptance is recorded separately. */
export const dailyOperationGuides20261012: OperationGuide[] = [
  {
    id: "C170",
    category: "care",
    title: "課程門市訊息如何查看、標為已讀或回查？",
    summary: "後台異動通知預設開啟，頂欄「數位管家」集中顯示課程與學員異動；最新消息保留 3 天，再移至歷史訊息保留 7 天，標為已讀不會改出席、堂數或帳務。",
    answer: "從頂欄「數位管家」切換最新消息／歷史訊息；可逐筆或全部標為已讀，讀取狀態不影響時間分類，必要時直接打開目前課程名單。",
    path: "頂欄 → 數位管家｜門市提醒",
    keywords: "課程門市通知 後台異動通知 頂欄 鈴鐺 最新消息 歷史訊息 未讀 已讀 全部標為已讀 3天 7天 10天 O 圈圈 復原 提示音 查看課程 學員請假 改期 取消 停課 60秒 數位管家 門市提醒",
    steps: [
      "回到後台頂欄確認「數位管家」；門市通知持續接收，提示音可在數位管家內調整。",
      "點「數位管家」切換「最新消息／歷史訊息」，展開一筆核對學員、異動類型、原／新時間、教師及影響名單；有「查看課程」時可在原頁開啟目前課程名單，完成後返回通知。",
      "確認後點 ○ 標為已讀；短時間可用「復原」，或點 O 標為未讀。「全部標為已讀」涵蓋目前門市兩個分頁，訊息保留原分類。失敗或資料已更新時重新載入核對。",
    ],
    important: "○／O 只更新訊息已讀狀態，不會替任何學員點名、扣堂、退堂、退款、收款或建立補課。要修正業務資料，必須進入對應課程另行操作。",
    success: "訊息保持原時間分類並保留已讀者與時間；重新整理後狀態一致，課程、出席、方案與帳務沒有被通知操作改動。",
    details: [
      "查看需 booking.read，標記或復原需 booking.update，設定開關需 business_hours.manage；總部分店檢視只能依實際權限查看，不能在子店視角代為處理。",
      "數位管家會隨頁面先顯示，清單在開啟時才讀取；系統每 60 秒及頁面回到前景時更新，不是即時推播。提示音預設開啟，可在數位管家右上角依目前裝置與門市關閉；瀏覽器仍需先有一次操作才可播放。第一次載入既有通知不響鈴。清單依訊息時間由新到舊排列。單頁最多 50 筆，可用上一頁／下一頁查找。最新消息滿 72 小時移到歷史訊息，再保留 7 天；滿 10 天到期，不再顯示；第一階段不刪除資料庫紀錄。",
      "一般後台新增預約沿用資訊紀錄；學員自行請假、取消、改期等異動提醒門市留意。整堂改期、停課或教師異動可能合併顯示影響名單，同一改期鏈會收斂成一筆。新業務異動重新計算訊息期限，單純標為已讀不延長期限；訊息過期不代表預約或業務已完成。",
      "關閉通知後數位管家隱藏且不再收集新事件；既有通知保留，重開後恢復原待辦，但不會回補關閉期間的異動。教練 LINE 通知及教師本人工作權限是另外的設定。",
      "「查看課程」會依通知保存的對象重新讀取目前課次，不信任舊畫面資料；課次已不存在、門市切換或權限不足時會顯示錯誤，不應改用拼接網址。",
    ],
    modules: ["course"],
    permission: "booking.read",
    feature: null,
    kind: "howto",
    verification: "source-reviewed",
    sources: [
      "src/components/admin/course-store-notice-bell.tsx",
      "src/components/admin/course-operation-switch.tsx",
      "src/server/actions/course-store-notices.ts",
      "src/server/services/course-store-notices.ts",
      "docs/course-store-notices-20261011.md",
    ],
  },
];
