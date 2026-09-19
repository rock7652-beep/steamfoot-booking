# 操作指南內容維護與下一批驗收

## 2026-09-19 增量盤點結果

已核對 main `e69323f41762d2caad6a92f998b591ca5bf61fa1` 至 `0a280a351f79a77ad1789d0a8b20196afbe269b2`。本次新增 C09、更新 C07／M01，共 86 篇；沿用草稿 PR #1042，不合併正式站。

| 已合併變動 | 指南處理 |
|---|---|
| #1043 LINE 會員首頁精簡與底部導覽 | 新增 C09，說明首頁／預約／方案／健康／我的、功能開通限制、非所有內頁都有導覽、分享選單不等於傳送。更新 M01 說明首頁「較上次」及量測日期、不從單一差值推定健康好壞。 |
| #1044 重複返回入口移除、空預約直接預約 | C09 說明用底部首頁返回、只有即將到來的空清單顯示「立即預約」；蒸足與 SPA 仍使用各自預約路徑與原資格檢查。 |
| #1045 已過期／歷史方案預設收合 | C07 提醒先展開再排查身分；筆數不等於堂數，收合不表示刪除，展開不恢復效期。 |
| #1046 方案及健康頁移除重複回首頁 | C09／M01 說明 LINE 會員底部首頁入口；不把 SPA 網頁會員專區與 LINE 所有畫面當成相同。 |

直接來源：

- C09：`src/app/(liff)/liff/liff-bottom-nav.tsx`、`layout.tsx`、`liff-shell.tsx`、`liff-store-share-card.tsx`、`bookings/_components/ready-view.tsx`、`bookings/bookings-list.tsx`、`profile/profile-view.tsx`。
- C07：`src/app/(liff)/liff/wallets/wallets-list.tsx`、`src/lib/liff/messages.ts`，保留原身分與登入核對來源。
- M01：`src/app/(liff)/liff/liff-shell.tsx`、`layout.tsx`、`liff-bottom-nav.tsx`、`health/health-view.tsx`，保留原後台健康頁來源與 `ai_health_summary` 功能限制。
- 本次差異只有會員介面 9 檔；沒有新增後端授權或交易規則。guide 的權限與模組篩選不變，C09 需 `customer.read`，M01 仍需健康功能開通。底部會員導覽不是店家後台操作指南的新入口。

驗證及待辦：

- 新增指南搜尋／權限、歷史方案收合語意及健康功能限制測試；保留原指南測試。最終測試數與 Preview commit 寫入本日 PR 留言。
- 瀏覽器本次可連線，但既有 Preview 仍為未登入狀態；遵守安全登入流程，不從歷史對話填入密碼。新舊共 9 題實際操作仍受阻，未宣稱通過。
- 待補截圖：底部導覽（含健康未開通時）、即將到來空清單及歷史空清單差異、過期／歷史區塊展開前後、健康比較日期。只在隔離測試資料與通知封鎖已確認後補驗收；不實際分享 LINE 訊息、不新增預約。
- `operation-guide-audit-state.json` 中 `newGuideIds`／`updatedGuideIds` 是本次數量，`cumulativeDraft*` 是未發布草稿累計，`interactionPendingGuideIds` 是去重後待驗題目。下次從已記錄的新 main commit 接續，不重複處理本批。

## 2026-09-17 首次盤點結果

檢查 main：`e69323f41762d2caad6a92f998b591ca5bf61fa1`。首次沒有上次成功 commit，故以此建立基準；讀取既有指南、覆蓋文件與來源，優先核對原來源基準 `44c1f1f` 之後已合併項目，不把未合併課程分支當成正式功能。

| 已合併變動 | 指南影響與處理 |
|---|---|
| #1035 店長通知篩選及 LINE 品牌視覺 | F01／F03／F04 已有設定與接收人說明；本輪沒有核實出需新增文章的操作規則，不新增篇數。新篩選介面截圖仍待登入核對。 |
| #1037 關懷購買與付款摘要 | 新增 D12，更新 E01、F08、F11；蒸足待核帳不等於已購買，後續邀請略過、不補發；SPA 不沿用蒸足訂單規則。 |
| #1036 操作指南正式發布 | production 入口已開；修正 coverage 及 inventory 開頭的過期狀態，舊批次保留為歷史。 |
| #1038 實際串接分段計費 | 新增 I07；按實際已串接數，不按額度；首間免串接費，2～5 間 $500、6～15 間 $300，16 間起報價，不自動扣款。 |
| #1039 通知開通保留原登入身分 | 更新 C08，區分通知與登入綁定，不教顧客任意解綁。 |
| #1040 入口先核對既有會員 | 更新 C07／C08，區分身分需確認、暫時故障與登入逾時，不引導舊客重新註冊。 |
| #1041 公開體驗申請 LINE 引導 | 屬尚未開通店家的官網申請流程；沒有更改已登入店家後台操作，本批不把公開申請教學塞入後台指南。 |

新增 2 題（D12、I07），更新 5 題（C07、C08、E01、F08、F11），總數 85 題；本批 7 題登入後實際驗收全數待處理，與既有高風險待辦並存。不能用題數宣告全系統覆蓋。

### 本批直接來源

- C07／C08：`src/lib/liff/messages.ts`、`src/app/customer-login-form.tsx`、`src/app/(liff)/liff/onboarding/onboarding-form.tsx`、`src/server/services/verified-line-customer.ts`、`src/server/actions/customer-auth.ts`、`src/server/services/bind-line-to-customer.ts`。
- D12：`src/server/services/trial-care-plans.ts`、`src/app/(liff)/liff/wallets/shop/[planId]/page.tsx`、`src/app/(customer)/book/shop/[planId]/checkout/purchase-button.tsx`、`src/components/purchase-receipt.tsx`、`src/server/actions/wallet.ts`。
- E01：`src/server/queries/store-todos.ts`、`src/app/(dashboard)/dashboard/payments/page.tsx`、`src/app/(dashboard)/dashboard/payments/confirm-button.tsx`、`src/server/actions/transaction.ts`。
- F08／F11：`src/lib/trial-care.ts`、`src/server/services/trial-care.ts`、`src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx`。
- I07：`src/lib/alliance-subscription.ts`、`src/app/(dashboard)/dashboard/settings/plan/page.tsx`、`src/app/hq/dashboard/stores/organization/store-organization-manager.tsx`、`src/components/plan-package-notes.tsx`。

### 驗收邊界及下次接續

- 4 檔 21 項指南測試通過；核對來源路徑、搜尋、權限、模組、付款頁相關分類、串接費範例及既有面板行為。不等於登入後驗收。
- 瀏覽器連線正常，舊預覽 `/hq/login` 顯示 Email／密碼／登入表單，未登入。非互動執行不能取得安全登入輸入，故實際操作「受阻」，不是網站故障；未使用舊對話密碼繞過安全登入。
- 必要待補畫面：購買與待確認摘要、付款確認視窗、身分衝突及暫時故障差異、關懷待核帳略過紀錄、串接費說明。沒有製作或宣稱新實際截圖。
- 後續驗收只用已確認隔離、通知封鎖的測試環境；預覽網址本身不等於資料隔離證據。本次沒有新建顧客、送單、確認收款、發通知或修改資料。
- `operation-guide-audit-state.json` 記錄本次已盘點 main 及未驗收題目。下一次先搜尋開啟中的操作指南盤點 Draft PR，從其分支讀狀態，再比較 `lastInventoriedMainCommit..origin/main`；未合併草稿不應重複建立基準。
- 後續仍需盤查人員權限細節、通知個別失敗、SPA 儲值異動及既有高風險操作；這些未全部逐題核對，不宣稱沒有其他缺漏。

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
