# 未建檔同行者獨立體驗收費

同行者不用填姓名電話也能按「收費 $499」。款項綁定自己的 BookingParticipant 與原預約，customerId 保持 NULL，不建立假顧客，不增加預約人的體驗紀錄、點數或推薦事件。兩位各收 $499 合計 $998；總營收與實際服務人次包括未建檔同行者，顧客去重與轉換名單只計有身分的顧客。

## 上線順序

1. 與最新 main 整合後重測。已包含 main 74a728414a8fea2efc4b533758bc5f6944fbee9b（#1289、#1291）。
2. 先在隔離資料庫執行 docs/sql/booking-unregistered-participant-payment-upgrade.sql。2026-10-11 已完成；columns_ready、trace_ready、guard_ready=true，browser_callable=false。沒有新增交易、顧客或測試金流。
3. SQL 只精確替換兩個 NULL 身分比較，保留 #1289 的方案預留、稽核撤回與扣堂保護。若重新套用 lifecycle SQL，必須再套用本升級並核對 readiness，才可啟用未建檔收費。
4. 正式合併前，需另行授權並完成正式資料庫的同一項相容升級。新增 Prisma Transaction 欄位會影響一般讀取，因此即使功能旗標關閉也須先準備欄位；npm run build 有唯讀正式 schema preflight，缺少欄位／FK／guard 即停止，不自動遷移。
5. 正式站另設 BOOKING_UNREGISTERED_PARTICIPANTS_ENABLED=true 才開放按鈕與 server action；BOOKING_PARTICIPANTS_ENABLED 必須保持既有 true。測試旗標只設於此支線 Preview。
6. 驗證隔離 Preview 與 CI，再完成登入業務驗收、正式授權與正式上線。

## 回歸與限制

- PostgreSQL 回歸涵蓋獨立收款、重試去重、跨店拒絕、孤立款項拒絕、收款身分不可改掛、合計 $998、VOIDED 保留、收款失敗回滾，以及 #1289 撤回／再次完成／更正後重收。
- UI 元件測試涵蓋無顧客資料時可收款，停用旗標時不顯示按鈕。沿用原本排列與付款表單，不增加說明步驟。
- 未建檔收款可沿用取消交易作廢；未新增部分退款表單，legacy 退款拒絕未建檔交易。未實作收款後補建檔或歷史款項改掛顧客。
- 未完成外部 Preview 登入收款及桌機／iPad／手機實際畫面驗收。元件模擬與 PostgreSQL 回歸不等於雲端業務驗收。
- 全站 lint 的既有紅燈須保留如實說明，不可寫成所有檢查通過。
- 正式站未套用本 SQL、未啟用旗標、未合併此支線。
