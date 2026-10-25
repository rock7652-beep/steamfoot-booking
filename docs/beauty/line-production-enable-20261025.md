# Beauty 正式 LINE 外發啟用

此流程接續 2026-10-25 正式上線及方案開通通知。使用者已授權獨立完成正式啟用；舊 release 文件的 `BEAUTY_NOTIFICATIONS_ENABLED=0` 是當次部署紀錄。

## 執行方式

- 合併本次通知 worker、唯讀 readiness 及啟用邊界後，僅修改 Vercel Production 非機密設定：`BEAUTY_NOTIFICATION_WORKER_MODE=shared-main-v1`、`BEAUTY_NOTIFICATIONS_ACTIVATED_AT=<啟用當下的 canonical UTC ISO timestamp>`，最後 `BEAUTY_NOTIFICATIONS_ENABLED=1`。再由已核對的 main SHA 建置 Production。
- 啟用邊界保留，不在一般重部署重設。若未來停用再重啟且需排除停用期間的排程，重新審核並將邊界移至重啟時間。回退方式是 Production flag 改 0 並重新部署。
- 保留 dedicated Beauty runtime role、TLS、RLS 與權限。既有共用通知 worker 使用原有 main core 連線處理 MessageLog、LINE 身分、額度及 manager logs；不新增角色、密碼、grant 或 migration。
- 正式建置唯讀核對 restricted Beauty 連線及 shared worker 的 DB 身分、資料表存取與 outbox 欄位。shared worker 僅限指定正式專案／repo main，Preview、QA、migration scope 不能啟用。

## 生效行為

- 各店及個別提醒設定、訂閱權益、額度、已驗證收件身分與顧客停收仍有效。方案開通通知維持全站預設開啟及手動停用選擇。
- 不補發啟用前的預約／購買事件與已完成體驗，不因開啟直接掃送既有低餘額卡。既有卡須有啟用後的新 ledger 異動才進入低餘額提醒。
- 下一次正常排程會檢查現有有效卡的到期提醒及未來預約；當日已錯過的 18:00 或 09:00 排程不補發。
- 舊 BeautyEvent 通知轉 SKIPPED，保留稽核資料，不修改訂單、卡片、款項或預約狀態。
- main 交易內的權益及收件人查詢使用同一交易連線，避免 connection_limit=1 額外 checkout。共用額度計入其他 PENDING 預留；未知傳送結果保留該筆預留。

## 驗證與限制

- 通知／preflight／權益／交易傳輸及不補發邊界測試；Beauty、方案開通、課程通知相關回歸；TypeScript 與 changed-file ESLint。
- 正式上線須確認 build 中 `beauty-notification-preflight enabled=true worker=shared-main-v1 readonly=true`、READY、正式 alias、未授權 cron=401，並觀察排程與舊事件排除結果。
- 不製造正式交易或向真實顧客送測試訊息。實際 LINE 收件仍需下一筆符合設定的新事件；上線驗證不等同顧客實機收件測試。
