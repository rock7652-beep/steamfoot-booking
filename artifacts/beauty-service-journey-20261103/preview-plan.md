# 隔離 Preview 準備

本地候選分支：feat/beauty-service-journey-20261103。
Vercel team：team_IAPnhzLHM4x540wiXg3lTyS9。
既有 QA project：steamfoot-compact-qa-20261103 / prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs。

唯讀核對已確認：專案存在且有 Vercel 登入保護；最近 READY 部署來源 05933fb831250f6e5bacf44993fd34993157d2da，不含本次本地實作，不能沿用為新版驗收。Preview 具有 DATABASE_URL、DIRECT_URL、AUTH_SECRET 與原有隔離旗標的設定項目；僅核對鍵名與 Preview target，未讀取或輸出秘密值。執行器沒有資料庫／登入秘密綁定，因此未進行登入後交易。

本地追加精確分支至既有 QA guard，沿用同一 project、隔離資料庫識別 ttworfzgwejdeolegkxl、限制角色、TLS 與通知關閉檢查。正式、其他專案、正式資料庫、管理角色或通知憑證仍拒絕。Vercel git deploymentEnabled 對本分支設為 false，避免 push 與手動部署各建一次。不更改既有環境變數或部署保護，不執行正式資料 migration。

新增分支 guard 的 21 項測試通過，包含候選分支接受以及正式環境／資料庫／通知拒絕案例。

## 待授權動作

1. 將本地候選分支推送至 GitHub 並建立草稿 PR（預計執行 PR CI）。
2. 以精確候選 commit 在上述 QA project 建立一次 Preview，先確認建置 guard 與 DB 隔離通過。既有部署不含新碼，無法重用；遠端建置可能產生費用，目前無法估算金額。
3. 依既有部署保護授權存取，唯讀核對 schema 與合成測試門市。若需要建立測試帳號／方案，先限定本次合成資料範圍；不得使用正式顧客、重設既有密碼或啟用通知。
4. 驗證一方案無合併入口、A+B 各方案預留、同／不同技師、各段加做、第二段不可用則整筆不成立、混合收款重送、改期／取消本段；核對實際資料與帳務後記錄結果。

草稿 PR／Preview 不包含合併 main、正式部署或正式帳務操作授權。
