# 操作指南內容維護與下一批驗收

## 維護方式

每次功能或規則更新，同批檢查對應教學；客服出現新的反覆問題時補進待辦。每批以一組可完整驗收的情境推進，避免每天為了增加篇數而修改。

每篇需確認：實際入口、按鈕名稱、角色／權限／模組、前置條件、結果與不可做的事。文章以店家情境命名；複雜規則折疊於詳細說明，主要答案放在最前面。

教學分為：
- 怎麼操作：先說這個操作做什麼，再列可照做的步驟與可看到的結果。
- 為什麼：先直接解釋原因，再給下一步；不硬湊三個步驟或「已理解」式完成確認。
- 遇到問題：按檢查順序排除原因，重送前先查既有結果，保留錯誤資訊。

## 下一批實際驗收優先序

| 優先 | 情境 | 檢查重點 | 截圖 |
|---|---|---|---|
| 1 | 取消／未到／部分到店 | 狀態、保留堂數、補課期限、是否退款的界線 | 有分支選擇的確認視窗 |
| 2 | 紙本轉入／補登／調整／到期日 | 不重複營收、正確剩餘堂數、原因、日期限制 | 輸入與預覽結果 |
| 3 | 退款／撤銷閉店 | 保留中預約阻擋、試算、權限與下一日限制 | 試算與限制提示 |
| 4 | SPA 班表／多人結帳 | 原班表覆蓋、衝突不部分儲存、各人權益 | 班表與結帳方式 |
| 5 | 分析／匯出／通知 | 期間口徑、下載範圍、略過原因、不實際發訊息 | 必要篩選與紀錄 |

以測試資料操作；不使用正式顧客個資，不發實際通知。截圖需與同一預覽版本相符。

## 本輪來源對照

以下列出本輪補題與高風險改寫的直接依據，其餘篇目完整來源在 catalogue。

### A08 顧客沒來，如何標記未到？

- `src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx`
- `src/server/actions/booking.ts`

### A09 同行預約只來一部分的人，怎麼處理？

- `src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx`
- `src/server/actions/booking.ts`

### D04 方案到期日填錯，怎麼修改？

- `src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx`
- `src/server/actions/wallet.ts`

### D09 堂數記錄不符，如何核對與更正？

- `src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx`
- `src/server/actions/wallet.ts`

### E06 收款資料登記錯誤，從哪裡修正？

- `src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx`
- `src/server/actions/transaction.ts`

### E11 閉店金額填錯，可以重做嗎？

- `src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx`

### F08 顧客已購買或預約，還會收到體驗邀請嗎？

- `src/lib/trial-care.ts`
- `src/server/services/trial-care.ts`
- `src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`

### I05 切換分店後，為什麼只能查看？

- `src/components/store-view-mode-switcher.tsx`
- `src/server/actions/store-view-mode.ts`
- `src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx`

### J09 服務人員請假，怎麼調整？

- `src/app/(dashboard)/dashboard/spa-staff/workspace.tsx`
- `src/server/actions/spa-resources.ts`

### D01 新方案要怎麼新增或修改？

- `src/app/(dashboard)/dashboard/plans/_components/plan-form-drawer.tsx`
- `src/server/actions/plan.ts`

### D05 不想讓顧客購買，應下架還是關閉公開購買？

- `src/app/(dashboard)/dashboard/plans/plan-publish-toggle.tsx`
- `src/app/(dashboard)/dashboard/plans/plan-active-toggle.tsx`

### D06 紙本舊客的剩餘堂數，怎麼轉進系統？

- `src/app/(dashboard)/dashboard/customers/[id]/migrate-paper-plan-dialog.tsx`
- `src/server/actions/wallet.ts`

### D08 已建好的方案，漏記紙本已使用堂數怎麼辦？

- `src/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form.tsx`
- `src/server/actions/wallet.ts`

### E03 方案還有剩餘堂數，怎麼登記退款？

- `src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx`
- `src/server/actions/transaction.ts`
- `src/lib/refund-plan.ts`

### H04 上個月體驗、這個月買方案，算在哪個月？

- `src/app/(dashboard)/dashboard/reports/page.tsx`
- `src/server/queries/conversion-metrics.ts`

### H05 營運資料如何匯出 Excel？

- `src/app/(dashboard)/dashboard/revenue/page.tsx`
- `src/app/(dashboard)/dashboard/data-export/page.tsx`
- `src/app/(dashboard)/dashboard/data-export/data-export-client.tsx`
- `src/lib/data-export-gate.ts`

### J10 多天班表一樣，能一次設定嗎？

- `src/app/(dashboard)/dashboard/spa-staff/workspace.tsx`
- `src/server/actions/spa-resources.ts`

### J11 SPA 服務完成後，怎麼收款或扣方案？

- `src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`
- `src/server/actions/spa-checkout.ts`


## 接續核對的六題

### D10 每一堂是預約中、已使用還是被註銷，在哪裡查？

- `src/app/(dashboard)/dashboard/customers/[id]/page.tsx`
- `src/components/wallet-session-detail.tsx`

### D11 只想作廢一堂未使用的堂數，怎麼處理？

- `src/app/(dashboard)/dashboard/customers/[id]/void-session-button.tsx`
- `src/components/wallet-session-detail.tsx`
- `src/server/actions/wallet.ts`

### F11 關懷紀錄顯示「已略過」，需要重新發送嗎？

- `src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`
- `src/lib/trial-care.ts`

### J12 顧客有 SPA 方案，為什麼結帳時不能扣次？

- `src/server/spa-checkout-credit.ts`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`
- `src/server/actions/spa-checkout.ts`

### J13 SPA 結帳顯示餘額不足或已經扣款，怎麼辦？

- `src/server/spa-checkout-credit.ts`
- `src/server/actions/spa-checkout.ts`
- `src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx`

### I06 分店選單為什麼沒有我想看的店？

- `src/lib/store.ts`
- `src/server/actions/store-view-mode.ts`
- `src/components/store-view-mode-switcher.tsx`



## 2026-09-16 正式發布授權

使用者授權將現有操作指南合併正式上線；開啟 production 入口，沿用原有模組及權限過濾。既有手機滑動與桌機視覺由使用者確認 pass；83 篇的程式來源已核對，但逐篇實際交易操作及補充截圖尚未全部完成，不宣稱全系統驗收通過。每日 Asia/Taipei 08:00 自動盤點已建立，後續內容變動先送草稿 PR 與預覽，不自動合併。
