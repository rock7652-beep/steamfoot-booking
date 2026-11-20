import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at main 9e623716; signed-in acceptance is recorded separately. */
export const dailyOperationGuides20261012: OperationGuide[] = [
  {
    id: "C170",
    category: "care",
    title: "課程門市訊息如何查看、標為已讀或回查？",
    summary: "從數位店長查看課程異動與門市訊息；已讀移至歷史，不代替點名、收款或客服處理。",
    answer: "開啟頂欄「數位店長」，切換最新消息／歷史訊息；逐筆或全部標為已讀，核對原課程與待收款，不能把已讀當成業務完成。",
    path: "頂欄 → 數位店長｜門市提醒",
    keywords: "數位店長 數位管家 鈴鐺 小鈴噹 最新消息 歷史訊息 已讀 未讀 全部標為已讀 72小時 3天 10天 復原 待收款 尚欠 待核帳 課程 門市通知 後台異動通知 學員請假 改期 取消 停課 查看課程 提示音 60秒",
    steps: [
  "確認目前門市，點頂欄數位店長圖示，切換最新消息或歷史訊息。",
  "展開訊息核對學員、異動、原／新時間與教師；有「查看課程」時在原頁開啟目前名單，再返回通知。",
  "需要標記時點 ○，等候儲存確認；可用復原或到歷史標為未讀。全部已讀前核對它涵蓋本店兩分頁，而非只處理目前列。"
],
    important: "已讀只更新訊息狀態，不會替任何學員點名、扣堂、退堂、退款、收款或建立補課；原業務必須到對應資料處理。",
    success: "已讀確認後可在歷史回查；原課程、出席、方案與帳務未因已讀操作改動。",
    details: [
  "最新消息只列發布未滿 72 小時的未讀訊息；標為已讀後移到歷史訊息，滿 72 小時的未讀也進入歷史。自發布起最多顯示 10 天，已讀、取消已讀及重讀都不延長期限；到期隱藏不代表刪除原業務紀錄或欠款結清。",
  "逐筆點 ○ 標為已讀時可先移除該列，但顯示儲存中並非成功；確認後才可復原，失敗會還原。歷史內點 O 標為未讀，發布未滿 72 小時才回到最新；較舊訊息仍在歷史。結果未確認時先重新讀取核對。",
  "「全部標為已讀」涵蓋目前門市有效期內兩個分頁的未讀訊息，不限目前這一頁；成功確認後最新列表清空並回第一頁，再讀取校正，歷史訊息保留至原到期時間。它不代表付款、客服或預約已完成。",
  "入口只顯示圖示，滑鼠提示及面板名稱是「數位店長｜門市提醒」；角標是有效期內未讀數，包含已滿 3 天仍未讀的歷史訊息。數量未知時不顯示假的零筆。約每 60 秒及切回視窗核對，不是即時推播；清單在開啟時才讀取，由新到舊，每頁最多 50 筆。",
  "後台持續接收門市提醒，不受店長個人 LINE 偏好控制。提示音只控制目前裝置與門市，採雙音且需瀏覽器先有互動；第一次載入既有訊息不響鈴，裝置靜音或自動播放限制仍可能無聲。",
  "完成服務、未到及恢復預約／恢復上課不另發面板提醒，既有同類訊息也不列入清單或未讀數；預約、出席、扣堂與 LINE 的原規則不因此改變。",
  "「待收款」與「待核帳」不同；有付款查閱權限才顯示尚欠金額與收款入口。收齊、免收或取消應收後，下一次核對解除待收款；已接受的單次／體驗最終收款不把原價差額當欠款，音樂學費依原分次收款帳核對。未確認的收款先查原請求，不重收。",
  "查看需 booking.read，標為已讀／未讀需 booking.update；總部分店檢視只能依實際權限查看，不能在子店唯讀視角代為標記。",
  "新業務異動重新發布並計時；不能將一般後台新增預約直接說成使用者已讀。查看課程會依本店現行課次重新核對，課次已不存在、門市切換或權限不足時先讀取確認，不拼接網址繞過。"
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
      "docs/course-store-notices-20261011.md","src/lib/store-notice-lifecycle.ts","src/server/actions/course-digital-manager-notices.ts","src/server/services/store-receivable-notices.ts"
],
  },
];
