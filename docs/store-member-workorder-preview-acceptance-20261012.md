# 中央會員連結與工單通知：隔離 Preview 驗收

驗收環境：`steamfoot-preview`（`ttworfzgwejdeolegkxl`）；程式版本 `f85f2004da26e3e2b0b49a16611a1d9ba7c02812`，Draft PR #1315。

Preview：https://steamfoot-booking-2i2lovddi-rock7652-2111s-projects.vercel.app

所有 LINE 來源與派送都是合成／封閉本地 stub；實際登入、UI、server actions、Prisma 與遠端 PostgreSQL 使用正常授權。沒有真實 LINE/SMS 外發、真實顧客修改、LINE 通道權限調整或正式發布。短時 Sandbox 僅允許此 Preview 及瀏覽器必要套件來源，不提供公開服務，兩次 session 均已停止／到期；沒有持久快照。

## 已登入 Preview 的實際結果

| 情境 | 結果與證據 |
| --- | --- |
| 蒸足、SPA、運動、音樂首次連結 | 四個正常 STAFF 帳號操作共用面板批准成功；合成既有 Customer 沒有重建，確認碼待確認 → 已連結。 |
| 之後沿用 | 四店重複 capture 均回 linked，沒有再次人工確認；第一次批准連點三次成功後仍只有原連結。 |
| 跨店同中央會員 | 另建合成 B 店顧客與相同已驗證來源 fixture，實際批准 action 重用 A 店 Account／User；SQL 證實 centralUserId 相同、storeId 與 customerId 分別不同。來源 fixture 不是實際 LINE HMAC/OAuth 證據。 |
| 不同 Provider／既有 owner 衝突 | 合成另一 Provider Account 提交確認被拒絕，原 B 店 identity link 的 userId 保留；未覆蓋或強制合併。 |
| 開關預設關閉、不補舊單 | 首次 READY 留下 SKIPPED、attempts 0；之後 UI 開啟再派送原單仍 SKIPPED。 |
| 首次 READY 排隊 | 實際工單建立 service＋UI status action 建立 PENDING；一般 Preview dispatcher 仍禁止外發。 |
| 併發、反覆 READY | 兩個真實 Prisma 派送協調器同時執行本地 stub；一個事件、attempts 1、SENT。PROCESSING → READY 再派送仍 attempts 1、原 retry key。 |
| 模擬 LINE 429／逾時 | FAILED、sentAt null、具體錯誤；工單保持 READY，total／paid 不變。UI 顯示原因。 |
| 失敗安全重試 | 等正常 nextAttemptAt 到期後再派送，原兩筆事件均 SENT、attempts 2、相同 retry key；沒有新增通知事件。 |
| 排隊後取件／取消 | 實際 UI status／settlement action 後派送為 SKIPPED、attempts 0；取消 reason 為合成文字，退款／收款皆 0。 |
| 排隊後關閉開關 | UI 關閉後派送 SKIPPED、attempts 0，理由為店家已關閉取件通知。 |
| 排隊後封鎖 | 僅合成顧客設定 BLOCKED；協調器 SKIPPED、attempts 0、原因為已封鎖本店 LINE、externalCalls 0。 |
| 跨店派送存取 | 音樂店 STAFF 操作蒸足店合成工單回 404。 |
| 結果用語 | UI 實際讀到「不代表已讀或保證送達」；SENT 只表示 stub 模擬 API 接受。 |
| RWD | 四模組顧客面板 × 五尺寸，共 20 組無整頁水平溢出；工單面板另五尺寸通過：1366×900、1024×768、768×1024、390×844、360×800。不是實體裝置/Safari 驗收。 |

完整回歸：1,053 檔成功、16 檔略過；9,996 項成功、129 項略過、0 失敗。TypeScript、修改檔案 ESLint 通過。重複電話多筆候選、撤權、額度耗盡、通道變更、新顧客原生建檔與真實 webhook HMAC 等仍以既有服務／webhook 單元回歸為證據，未把它們寫成真實 LINE 操作已驗收。

## 收尾狀態與工具限制

所有工單通知開關已 OFF；合成帳號與本次建立的中央會員帳號已 SUSPENDED，門市帳號 passwordHash 已清空；合成通知沒有 PENDING／FAILED 可派送事件。既有工單仍 23 筆。

合成資料清理工具兩次回傳 `Invalid or expired requestState`，內建 DELETE 確認未成功完成。已停止重送，不繞過確認、不宣稱刪除成功。隔離資料庫尚保留 5 位合成顧客、10 張 total=paid=0 的合成工單與相關測試身分／稽核／本地 stub 通知紀錄；後續清理只限固定 `qa-member-workorder-20261012:` 前綴及已核實的四個合成中央 User。

23 小時存取連結仍依使用者授權有效至 2026-10-13 12:26（Asia/Taipei）；秘密參數不寫入此文件或 PR。店務仍正常登入。正式發布、真實 LINE/OAuth/QR/印表機、實體 Safari、SMS 供應商及費用規則沒有新增授權。

## 最新 main 整合與正式發布唯讀預檢

已整合 main `5e0a8dc1`（#1314）。課程提醒頁衝突採用 main 的按分頁／平行讀取與 timing，同時保留工單通知設定；未撤掉 HQ 三態或外發守門。新頁面讀取測試補上工單 getter／元件邊界，直接相關 54 項通過；完整回歸 1,056 檔成功、16 檔略過，10,055 項成功、129 項略過、0 失敗。TypeScript、修改檔案 lint、whitespace 通過。此整合未另行重跑上方已登入瀏覽器矩陣，其證據仍對應 f85f2004。

正式 project `steamfoot`（`qijlnhtpbintanzpxkvf`）僅做 metadata/schema 唯讀檢查：本次兩張表／通知欄位不存在，Customer 店別唯一 key 與 browser roles 已存在，InventoryOrder 新 index 名稱未被占用。沒有執行正式 SQL。正式發布須另取得具體授權：先套用相同 SHA-256 的增量 SQL（預設 OFF、無回填），再合併 #1315／發布；不包含 LINE 通道權限更動、會員合併或真實發訊。
