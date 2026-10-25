# 免費本機瀏覽器：隔離美業實際驗收

驗收日期：2026-10-26（台灣時間；UTC 2026-10-25）。使用者明確允許新增僅限隔離美業測試店的後台驗收帳號，驗完停用。使用本機 Playwright／Chromium，未使用 TinyFish。

## 版本與範圍

- 程式：`eafcc9680b2a867e2c9f507032e835973a9bc5d3`；部署 `dpl_AraNQ37aQu3wJa6WjSB1sLsNfWus`，READY。相對先前 READY 的 c3057091 只有驗收文件異動。
- 唯一資料庫：`steamfoot-preview`／`ttworfzgwejdeolegkxl`；唯一店家：`beauty-hosted-20261021`。
- 新帳號 `qa-beauty-live-dcb20e3a85`，角色 MANAGER，Staff `qa-beauty-live-staff-dcb20e3a85`。只連結本測試店並設定本輪所需權限，沒有 HQ／ADMIN 身分。密碼隨機產生，只存本機私有暫存檔，未進入對話、Git 或報告。
- 用應用程式 Email／密碼正常登入，session 確認 role、storeId、staffId；未合成應用 session。
- 使用指定 Preview 的限時 Vercel 存取，沒有關閉 Deployment Protection、變更 Production 或使用其他店家 LINE。
- 顧客從 UI 新增：`cmvo6q4l60001jw07p4qxdncx`／`QA本機驗收1025-甲`。沒有修改任何既有顧客。

## 已通過：畫面與權威資料核對

| 案例 | 實際結果 |
|---|---|
| 新增顧客 | UI 儲存成功，重開資料一致；資料庫同電話僅一筆。 |
| 購買方案／折抵 | 既有「測試五次方案」原價 4,500，折抵 100，以轉帳登錄；新卡 5 次，唯一 SALE 付款 4,400，未修改既有方案設定。 |
| 新通知表交易接點 | 發卡成功且建立一筆 BEAUTY 通知；status=SKIPPED，原因為隔離預覽不向外發送 LINE。MessageLog 同為 SKIPPED、sentAt=NULL，沒有待發或成功發送紀錄。 |
| 延後期限 | 2027-01-23 改為 2027-02-01，畫面與 DB 同步，餘次 5。 |
| 提早期限／重開 | 改為 2027-01-20，重新開啟新增預約仍帶此日期；DB 為該日台灣時間結束（15:59:59.999 UTC）。 |
| 預約資源檢查 | 原先 09:00 有衝突，按鈕阻擋並提供替代時間；改為可用的 10:30 後成功。沒有繞過按鈕或後端資源檢查。 |
| 方案預約 | 2026-10-27 10:30–11:30，測試女技師／測試空間 A；使用新卡，價款 0、保留 1 次，實際餘次尚為 5。 |
| 出席 | 點前方圓圈，COMPLETED／debit=true，5→4；帳本新增 -1。 |
| 恢復待服務 | 狀態選單恢復，RESERVED／debit=false，4→5；帳本新增 +1。 |
| 未出席不扣次 | NO_SHOW／debit=false，餘次 5。 |
| 未出席扣次 | NO_SHOW／debit=true，餘次 4；再恢復待服務回到 5。 |
| 操作選單 | 狀態選單顯示恢復待服務、不扣次、扣次；右側僅顧客資料、換技師／位置、取消預約、購買方案。 |
| 取消預約 | 接受瀏覽器原生取消確認後，CANCELLED／revision=7／debit=false，餘次 5；本預約帳本 delta 加總 0。 |
| 方案註銷 | 註銷成功、closedAt 有值、剩餘 5 次保留且畫面顯示僅供查詢；唯一 SALE 4,400 仍保留，沒有建立退款。 |
| 單次／體驗入口 | 真實登入後切換為一般應收 1,000／體驗應收 500，方案使用 0 次；只核對帶價，未提交額外預約或收款。 |
| 搜尋狀態 | 顧客清單搜尋本次新顧客，開顧客、進購買方案、返回、關閉，搜尋值仍保留。未以此代替篩選／長清單捲動完整驗收。 |
| 視窗尺寸 | 註銷方案畫面於 1024×768、390×844 無整頁水平溢出；桌機 1366×900 亦已查看。這是瀏覽器 viewport，非實體裝置。 |

新卡：`cmvo6tcyx0000jw073md6pvmf`；付款：`cmvo6tczs0002jw07paqje8ba`；預約：`cmvo71smk0008jw070f2kldua`。均保留為標記測試資料，不刪帳本或付款。

提交成功的單次樣本，提交後數個 fetch 資源約 1.0～1.3 秒；包含 action、calendar 與路由讀取，不能當作穩定的端到端速度或前後對照。原自動化紀錄的 responseEnd 尚未完成時會記 0，該欄位不用於性能結論。

## 收尾與限制

- 新帳號 User=SUSPENDED、Staff=INACTIVE、passwordHash=NULL；既有瀏覽器 `/api/auth/session` 已回傳沒有 user。保留建立／停用 QA 稽核。
- 停用首次 SQL 把 UserStatus 誤用為 INACTIVE，被 enum 拒絕，交易未提交；依既有停用規則改為 SUSPENDED 後成功並重驗 session 失效。
- 本次建立的限時 Vercel share 已撤銷，沒有重新產生；本機密碼及存取暫存檔已移除。
- 本機瀏覽器 page error 為 0。第一次流程結果檔於重新登入時被覆寫；第一次的扣次／恢復結論依本輪即時資料庫查核及保留截圖記錄，不宣稱後附 JSON 包含全部步驟。
- **尚未實測**：快速切換兩位顧客收款、現金抽屜／退款、設定店家固定費用後的分帳、並行重複提交、多人改期。未將單人轉帳購卡與本機既有測試當作上述案例通過。
- 正式庫、正式環境及既有顧客資料未動，LINE 沒有啟用。本輪沒有應用程式碼修改或正式發布。

證據：[本輪後半瀏覽器結果](evidence/20261026-free-hosted-qa/browser-results.json)、[折抵報價](evidence/20261026-free-hosted-qa/purchase-discount-before.png)、[恢復待服務](evidence/20261026-free-hosted-qa/attendance-restored.png)、[平板註銷方案](evidence/20261026-free-hosted-qa/card-closed-1024.png)、[手機註銷方案](evidence/20261026-free-hosted-qa/card-closed-390.png)。
