import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at main 9e623716; signed-in acceptance is recorded separately. */
export const dailyOperationGuides20261012: OperationGuide[] = [
  {
    id: "C170",
    category: "care",
    title: "課程門市異動通知如何查看、處理或復原？",
    summary: "後台異動通知預設開啟，頂欄鈴鐺集中顯示課程與學員異動；O 只處理通知，不會改出席、堂數或帳務。",
    answer: "從頂欄鈴鐺切換待處理／已處理，展開通知核對課程；具權限者可標記已處理或復原，必要時直接打開目前課程名單。",
    path: "設定 → 通知與顧客經營 → 後台異動通知；頂欄 → 門市通知鈴鐺",
    keywords: "課程門市通知 後台異動通知 頂欄 鈴鐺 待處理 已處理 O 圈圈 復原 提示音 查看課程 學員請假 改期 取消 停課 60秒",
    steps: [
      "回到後台頂欄確認鈴鐺；通知預設開啟，需要停用時再由具設定權限的人員到課程設定關閉「後台異動通知」。",
      "點鈴鐺切換「待處理／已處理」，展開一筆核對學員、異動類型、原／新時間、教師及影響名單；有「查看課程」時可在原頁開啟目前課程名單，完成後返回通知。",
      "確認後點 ○ 標記已處理；短時間內可用底部「復原」，或到已處理分頁點 O 恢復待處理。失敗或提示資料已更新時先重新載入核對，不要重複點擊。",
    ],
    important: "○／O 只更新通知處理狀態，不會替任何學員點名、扣堂、退堂、退款、收款或建立補課。要修正業務資料，必須進入對應課程另行操作。",
    success: "通知移到正確分頁並保留處理人與時間；重新整理後狀態一致，課程、出席、方案與帳務沒有被通知操作改動。",
    details: [
      "查看需 booking.read，標記或復原需 booking.update，設定開關需 business_hours.manage；總部分店檢視只能依實際權限查看，不能在子店視角代為處理。",
      "鈴鐺會隨頁面先顯示，清單在開啟時才讀取；系統每 60 秒及頁面回到前景時更新，不是即時推播。提示音預設開啟，可在鈴鐺右上角依目前裝置與門市關閉；瀏覽器仍需先有一次操作才可播放。第一次載入既有通知不響鈴。單頁最多 50 筆，可用上一頁／下一頁查找。",
      "一般後台新增預約是已處理資訊；學員自行請假、取消、改期等需要門市留意的異動進入待處理。整堂改期、停課或教師異動可能合併顯示影響名單，同一改期鏈會收斂成一筆。",
      "關閉通知後鈴鐺隱藏且不再收集新事件；既有通知保留，重開後恢復原待辦，但不會回補關閉期間的異動。教練 LINE 通知及教師本人工作權限是另外的設定。",
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
