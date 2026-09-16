# 體驗客回訪與購買驗收（2026-09-16）

## 本次變更

蒸足的待核帳訂單不再混算為已購買。已成立且付款狀態 PENDING 的本店 PACKAGE_PURCHASE 會略過第 4／10 天邀請；發送前再次查詢，避免在初次檢查後送單仍收到邀請。第 1 天關心不受影響。略過階段不補發；取消訂單後，尚未到期的階段依狀態重新判斷。SPA 沿用自己的資料來源。

## 已驗證

- TypeScript、變更檔 ESLint、git diff --check 通過。
- 9 組自動測試共 81 項通過，包含待核帳攔截、發送前狀態改變、店別／顧客隔離、付款確認前不開通、封存效期與堂數、重複確認不再開通。
- Preview staging 購買頁 HTTP 200，顯示測試銀行、複製帳號與登入後繼續。
- Preview 資料庫存在 Transaction_pending_self_purchase_per_plan_key，防止同店同顧客同方案建立重複待核帳申請。
- staging-store 體驗關懷未啟用。Preview 的發送封鎖維持。

## 測試資料

僅更新 Preview 專案 ttworfzgwejdeolegkxl 的 staging-store ShopConfig：

- bankName：測試銀行（僅供驗收，請勿匯款）
- bankCode：000
- bankAccountNumber：00000000000000

更新前為 bankName=test、bankCode=111、bankAccountNumber=NULL。測試帳號保留供預覽，沒有修改正式資料、沒有實際轉帳、没有建立付款訂單或發送 LINE。

## 尚未完成的整段驗收

雲端瀏覽器在取得分頁時持續逾時，無法操作登入及送單。以下不能宣稱已通過：真實 LINE 登入返回方案 → 填寫後四碼 → 送出 → 店長於頁面核帳 → 顧客看到開通結果。自動測試包含核帳動作的邏輯，但不等於測試店實際操作。

恢復瀏覽器後，以測試顧客走上述流程，核對同筆訂單只產生一份方案，再重複確認驗證。全程不使用真實付款，不發送真實 LINE 訊息。PR 保持草稿，未合併正式站。
