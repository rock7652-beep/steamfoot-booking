import type { OperationGuide } from "./operation-guide-types";

/** Backend source review at e5cd20fe; signed-in acceptance is recorded separately. */
export const dailyOperationGuides20261010: OperationGuide[] = [
  {
    id: "A14", category: "money", title: "蒸足多人單次收款，原價是每人還是整筆？",
    summary: "單次收款原價是整筆人數合計；已有預計金額則沿用該總額，不再乘人數。",
    answer: "沒有預計金額時以方案單價乘預約人數，無單價才以每人 799 元計算；已有金額快照包含 0 元都視為整筆總額。",
    path: "預約管理 → 單次預約明細 → 收款",
    keywords: "單次 多人 原價 人合計 預計收款 金額快照 799 實收 部分到店 折抵原因",
    steps: ["核對原預約人數、單次類型及預計收款總額。", "開啟收款，核對「原價（N 人合計）」與實收；部分到店時依實際金額及既有折抵原因處理。", "確認實際收到款項後只送出一次，再查原交易與預約；結果不明先查紀錄。"],
    important: "不會自動回寫舊交易或重算已有快照；不要把已有總額再乘人數，也不要把預約人數直接當成實到人數。",
    details: ["例如沒有快照且採預設單價，2 人合計為 1598 元；已有優惠總額 1200 元則仍為 1200 元。", "SPA 同行及課程預約逐人建立收款資料，不能套用蒸足整筆乘人數。方案改單次見 A12，首次體驗沿用其原流程。", "歷史快照疑似錯存單價時，先核對是否優惠與原交易，不自動更正已收款資料。"],
    success: "明細與收款視窗總額一致，原交易只有一次收款，歷史已收款未被改寫。",
    modules: ["steamfoot"], permission: "transaction.create", feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/lib/single-booking-price.ts", "src/app/(dashboard)/dashboard/bookings/compute-amount.ts", "src/app/(dashboard)/dashboard/bookings/collect-single-modal.tsx", "src/server/actions/single-booking.ts"],
  },
  {
    id: "I20", category: "settings", title: "店主如何查看本店操作紀錄？為什麼沒有入口？",
    summary: "只有獨立開通且仍有效的 OWNER 可查本店業務紀錄；試用或方案內含不會自動開通。",
    answer: "店主本人須有本店啟用中的店主人員身分；總部另開通本店操作紀錄後才有入口，不能查看登入、安全或私人備註。",
    path: "店家後台 → 操作紀錄；原業務資料 → 查看紀錄",
    keywords: "店主 OWNER 本店操作紀錄 獨立開通 功能未開通 到期 隱藏 稽核 誰修改 唯讀",
    steps: ["確認目前是自己的營運中或試營運門市，登入身分為 OWNER 且本店人員仍啟用。", "開啟「操作紀錄」，選開始與結束日期並查詢，再展開目標操作核對時間、操作人及業務異動。", "需要修正時關閉紀錄，回原預約、收款或庫存功能處理；沒有入口時請 HQ 核對本店獨立授權與有效期間。"],
    important: "MANAGER、STAFF、PARTNER、母店查看子店及未開通 OWNER 不取得此權利；HQ 切店也只看該店範圍，完整 HQ 稽核需返回總部。",
    details: ["只提供已核准的業務動作及有限數值、狀態，不提供登入連結、IP、安全資訊、私人文字備註或總部事件。未知或缺少當時身分的舊紀錄可能僅 HQ 可查。", "關閉、隱藏或到期會收回查看權，不會停止原業務紀錄保存；無入口不代表原紀錄遭刪除。", "紀錄唯讀，不能還原、退款、扣堂或發通知；沒有可顯示欄位也不能直接判定原資料沒有異動。"],
    success: "授權店主只能查正確本店業務紀錄；完整登入與安全資料仍留在 HQ。",
    modules: ["steamfoot", "spa", "course"], permission: "store.audit.read", feature: "store_operation_audit", kind: "howto", verification: "source-reviewed",
    sources: ["src/server/services/store-operation-audit-access.ts", "src/server/services/store-operation-audit-reader.ts", "src/lib/store-operation-audit-policy.ts", "src/app/(dashboard)/dashboard/operation-audits/store-operation-audit-view.tsx", "src/components/sidebar.tsx"],
  },
  {
    id: "J24", category: "spa", title: "SPA 當日名單怎麼原地編輯本次備註？",
    summary: "待確認或已預約的原列可用鉛筆編輯本次備註，不必開整筆預約明細。",
    answer: "核對正確服務預約後展開原列編輯並儲存；店內長期提醒與本次備註分開，字數上限 500。",
    path: "SPA 排程 → 當日預約名單 → 本次備註鉛筆",
    keywords: "SPA 本次備註 鉛筆 原列編輯 店內備註 全文 標籤 草稿 取消 Escape 資料已更新",
    steps: ["選日期並核對顧客與服務預約，點原列本次備註鉛筆。", "輸入最多 500 字並明確儲存；取消或 Escape 遇未儲存變更會詢問是否捨棄。", "核對原列文字；摘要截斷時點標籤與備註區查看全文，關閉返回原清單。"],
    important: "限具預約編輯權限且可寫入本店者，僅待確認／已預約可改；已完成、取消或未到不提供此原列編輯。",
    details: ["只更新該筆本次備註，不改服務、同行、狀態、收款或方案扣次；標籤編輯仍依顧客標籤原權限。", "網路失敗保留輸入；資料已被別人更新時先核對目前備註，需要時保留自己的輸入，再確認後儲存。", "Enter 用來換行；保留草稿不代表已儲存。長期提醒仍回顧客資料維護。"],
    success: "備註在原預約列更新，服務與帳務狀態維持原值。",
    modules: ["spa"], permission: "booking.read", feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/spa-schedule/booking-roster.tsx", "src/components/admin/inline-roster-note.tsx", "src/components/admin/roster-reminders.tsx", "src/server/actions/spa-booking.ts"],
  },
];
