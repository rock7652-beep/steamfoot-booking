# 顧客 LINE 手機重新綁定驗證

本資料夾記錄合成元件測試：取消綁定、開始重新綁定、等待輸入電話與模擬完成。桌機、iPad 及手機共七組 Chromium viewport，見 `component-results.json` 和截圖。這些不是實體裝置、正式顧客或真實 LINE 驗證。

實作使用由 OWNER／ADMIN 在指定顧客啟動的限時申請。官方帳號 webhook 在簽章驗證後處理電話，交易內檢查申請、門市、手機、LINE 身分與操作者狀態；衝突不執行綁定。Messaging 身分不建立 LINE Login OAuth Account。系統 LINE 外發停發設定不變。

此前使用者確認沒有獨立 LINE 測試官方帳號，因此真實 LINE 端到端流程仍待驗證。正式站未因本次修改而合併或部署。
