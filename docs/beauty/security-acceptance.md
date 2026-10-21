# 美業撤權、低權限與跨店隔離補驗

> 本頁保留當輪驗收範圍與當時下一步；現行店家試用請見[三端試用清單](store-trial-checklist.md)，正式啟用狀態及後續補驗請以[啟用前證據總表](release-readiness.md)為準，不把歷史待辦重算為仍未完成。

2026-10-21，基準 `798c94b7`，沿用美業獨立支線及任務專用 Sandbox。正式站、共用 preview、LINE 通道及通知開關未變動。本輪沒有發現需要修改產品程式的權限缺口；交付可重現的 HTTP 驗收工具與證據。

## 結果與證據

最終執行 `f10b64a0`：**16組通過**，[機器結果](evidence/security/results.json)。`scripts/qa/beauty-sandbox-security.mjs` 使用真正 Auth.js 登入、公開 HTTPS、真正 Server Actions／RSC 及受限 Prisma backend。沒有偽造 session、停用 TLS 驗證、mock action 或使用額外產品測試入口。

| 範圍 | 實際驗證 |
|---|---|
| 正向控制 | 真正店長讀本店顧客成功；真正技師讀自己服務的改期時段成功，避免將錯誤 action ID／失效登入造成的假失敗當作權限通過 |
| 受限人員 | 20筆管理操作，涵蓋18個 action export；全部收到 action 明確的權限拒絕，資料摘要不變 |
| 顧客／未登入者 | 各20筆相同管理請求由後台路由層拒絕；這40筆不冒稱已抵達每個 action 的授權分支 |
| 工作歸屬 | 技師不能改別的技師服務，也不能查其改期時段；一般顧客不能以 `work` 模式操作 |
| 完成、取消、改期撤權 | 沿用同一次真實技師登入，各自撤回 `complete`、`cancel`、`reschedule`，後端立即拒絕原本有權的操作 |
| 技師停用／解除連結 | `active=false` 或解除 `userId` 後，既有工作登入的寫入及讀時段均被拒絕 |
| 收入撤權 | 原先真正 RSC 只包含本人已確認收入；同一次登入撤回 `income` 後，回傳 `grants` 不含收入權限且 `income=[]`，不是只隱藏收入按鈕 |
| 登入帳號停用 | 將合成 User 設為實際 schema 的 `SUSPENDED` 後，舊工作登入拒絕寫入 |
| 外店 ID | 本店店長帶入外店顧客、服務、方案、技師、空間、預約、付款、共用卡與待核帳訂單 ID；17筆 action 請求全部拒絕，沒有外店私密標記或資料異動 |
| 改門市網址 | Owner 直連另一間沒有授權的合成店後台，被明確拒絕，沒有顧客私密標記 |
| 偽造門市標頭 | 對本店網址帶入外店 `x-store-slug`／`x-store-id` 並讀外店顧客，仍明確失敗且不洩漏資料 |
| 拒絕後的資料 | 驗收比較兩店13個美業模型、顧客、空間及共用收支帳摘要；所有拒絕請求都沒有改變這些業務資料，待發通知0 |

管理操作包含服務／方案／技師設定、營業設定、空間、建約／改狀態／改期、收款、購買方案、退款、月結確認、拆帳付款與收回、顧客新增／讀取／修改、共用成員、連結顧客及轉帳核帳。跨店17筆中有16筆由店長操作，另1筆外店改期時段由一般會員操作；未將該筆寫成店長操作證據。

## 測試方式及還原

- 測試開始先執行既有 Sandbox scope：固定本任務 HTTPS origin、專用 loopback DB、非 superuser／無 BYPASSRLS backend、development、通知關閉。沒有連到正式／其他任務資料庫。
- QA backend 只建立具本次識別碼的合成外店／顧客／服務／空間／方案／卡／付款／訂單，以及本店未使用日期的合成預約，作為拒絕測試目標。這些 fixture 是直接建置，**不當作一般建約、售卡或收款UI驗收**。
- 測試從當次 dev build 的 server-reference manifest 找到公開 action 引用，正常帶 Auth.js cookies 送 HTTP 請求；僅讀 action ID 與 export 名稱，不讀 manifest 的加密 key，不輸出 cookies、session 或密碼。action ID 本身不視為權限。
- 拒絕後即比對資料摘要，並檢查回傳沒有外店私密標記；預期權限錯誤另驗證具體訊息，不以任意500／validation error當作通過。
- `finally` 還原原合成技師的啟用、帳號連結及四項權限，還原 User 狀態；已另以真實 Auth.js 驗證技師重新登入成功。停用測試可能撤銷舊登入，密碼未更動。
- 失敗初稿曾用錯正向操作路徑、選到已被舊合成 fixture 占用的日期，及使用不存在的 User 狀態值；修正工具後以新識別碼完整重跑，失敗輪次沒有計入最終通過。合成紀錄保留，不刪帳清場。

重現：在同一專用 Sandbox repository 中，以命令環境提供 `QA_BEAUTY_REVIEW_PASSWORD`，執行 `node --env-file=.env.local scripts/qa/beauty-sandbox-security.mjs`。需先有既有合成售卡及本月已確認收入，以驗證收入正向控制；沒有這些前置證據時工具拒絕。

本次指定回歸3檔／36項通過（beauty access、transactions、sandbox scope）；腳本語法、ESLint、diff check通過。產品 TypeScript／UI 未修改，未重跑全站測試或宣稱正式部署已通過。

## 證據邊界與下一步

這是專用 PostgreSQL／development build 的實際 HTTP 授權驗收，不是正式 Supabase PostgreSQL17／pooler、production build、母子店唯讀或所有撤權競爭時序的證明；本輪未窮舉登入帳號管理、共用 LINE entry 或每個公開表單的全部組合。路由層拒絕與 action 明確拒絕已分開記錄。

下一步先補驗取消／未到「扣次／不扣次」設定組合、恢復及服務更正後的餘額與帳本，讓店家規則與三端顯示一致。LINE 真實登入及指定收件人送達，待申請完成、測試通道綁定後接續；正式合併、migration 與啟用另行處理。
