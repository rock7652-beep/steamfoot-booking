# 美業交接統一整合審查（2026-10-25）

> 此為交接當時的紀錄。後續收費表單已接回 CoursePlanDraftForm；最新狀態見 [收費接回與發布審查](charge-release-review-plan-20261025.md)。全站正式版整合仍未完成。

交接檔已完整接手並整合到獨立本機支線；未推送、部署或操作資料庫。此文件統一記錄另一個對話的交接成果與本對話原有成果，後續不需兩邊重複執行。

## 保全與整合

- ZIP：beauty-charge-full-handoff-20261025.zip，SHA256 `a7c712e80aa1a2a78196c8c4389ebc1ee7154bb6e3a8fd6ab065f41893f5d9f7`。
- 全包 SHA256SUMS 通過；41 個來源檔（13 修改、28 新增）與 patch 套用結果逐檔一致。六欄位 SQL 兩份副本一致。
- 原基底 `6092de9111ec5f778d2f003c49657c4c073339d4`；原始交接保全於本機 `review/beauty-charge-import-20261025`，提交 `c9047e54`。
- 統一工作區 `/workspace/steamfoot-beauty-unified`，支線 `review/beauty-unified-handoff-20261025`，基底為本對話 `d2216c57`。交接整合提交 `70612970`。
- 只有 catalog-adapter.tsx 一處內容衝突：合併後保留 compact、confirmDiscard:false，以及新規則啟用後停用舊價格 writer／禁止用收費修改全域技師資格。
- 原有收款對象隔離、清單返回狀態、HQ 美業切店與 Google Maps 設定呈現均保留；未用來源完整檔案覆蓋本對話版本。
- 發現交接新增表單重新引入未儲存確認提示，依使用者既有要求移除；保留 pending 關閉鎖及重複送出鎖，新增 DOM 行為回歸測試。
- 調整既有清單 DOM 測試的 server action stub，讓新增收費／開店元件不意外載入真實登入／資料庫邊界。

## 獨立重新驗證

- 27 個測試檔、232 項 mocked／pure／DOM 測試通過。包含新收費規則、權限與來源、售卡／預約快照、時段與改期限制、既有收款及出席、顧客／購買方案返回狀態。
- TypeScript `--noEmit --incremental false` 通過；34 個變更 TS／TSX 檔 ESLint 通過、0 警告；git diff --check 通過。
- Prisma Client 以假的 localhost:1 連線設定離線產生，generated 為本工作區獨立副本，不修改其他 worktree 的 client。
- 所有上述 Node 程序均載入網路／資料庫 socket 封鎖器。未執行含自動 migration 的 npm run build。
- 交接原有 229 項測試與本輪 232 項範圍重疊，不相加成總驗收數。
- 人工檢視交接桌機單次與手機多次截圖；它們是舊的靜態假資料截圖，不是本輪重拍或測試站實際操作。8 組版面通過仍僅屬交接回報。
- 套用與關閉提示修正後的本輪證據見 evidence；不代表已完成並發鎖、真實收款、瀏覽器、手機或平板驗收。

## 尚需處理的介面沿用差異

交接中的 BeautyChargeEditor 是美業專用新表單，使用共用 RightSheet 外框；開啟新模式後，收費清單使用 BeautyChargeWorkspace。這不等同直接沿用運動最新版完整原版表單。因此本輪只保全及整合交接成果，**沒有把「完全沿用原版」標為通過**。後續需核對原版表單可注入的欄位／業務接點，接回共用頁面，或逐項明列確實無法共用的部分；不得繼續另做一套相似介面。

## 統一尚缺清單

| 項目 | 已有成果 | 剩餘工作 |
| --- | --- | --- |
| 收費與技師限制 | 本機 writer、快照、預約分配、改期限制已整合；離線測試通過 | 原版共用表單沿用對照；新版真實儲存／重開／售卡／預約驗收 |
| 六欄位升級 | 待審 SQL 保留在 docs/qa/sql，僅新增 nullable 欄位 | 精確目標與欄位／筆數、鎖定、角色權限及回退審查；未授權套用 |
| 正式美業資料結構 | 10/24 唯讀檢查顯示正式庫缺 14 張 Beauty 表 | 正式基礎安裝與六欄位是不同層次，不得只跑六欄位 SQL；本輪未重查遠端 |
| 正式版本整合 | 本對話與此次交接已本機合併 | 與正式 main 的共用改動仍待整合；先前 74 個衝突是對正式 main 的試算，與本次已解決的 1 處衝突不同 |
| 瀏覽器操作與版面 | 清單保留及收款隔離有 DOM/API 證據 | 真實瀏覽器切換與返回、最新表單手機／平板仍待驗；先前真機結果不可套用新表單 |
| 現金收退款 | 前輪轉帳記帳／折扣及扣還次通過 | 舊測試抽屜核對與正常結帳、新日現金驗收；本輪未關閉既有抽屜 |
| 備份與還原方式 | 官方方式與舊確認紀錄可用 | 當日可還原點仍待核對；無新增備份匯出、還原或憑證要求 |

六欄位必須先到位，才能部署新版 Prisma Client；關閉 feature flag 不能避開 ORM 完整欄位讀取。啟用後存在 SELECTED 規則時，不能回退成不執行限制的舊後端；可關閉新編輯入口而維持限制。這些是發布審查事項，本輪沒有調整任何環境開關。

使用者限制繼續：資料庫寫入、重試、migration、清資料與部署停止；LINE 關閉、正式站不動。

證據：[review.json](evidence/20261025-unified-handoff/review.json)、[測試](evidence/20261025-unified-handoff/tests-expanded.log)、[型別](evidence/20261025-unified-handoff/typescript.log)、[Lint](evidence/20261025-unified-handoff/eslint.log)。
