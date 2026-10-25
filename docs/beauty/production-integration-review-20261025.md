# 美業與正式版共用程式整合結果（2026-10-25）

本輪僅在本機隔離支線 `review/beauty-production-integration-20261025` 整合。資料庫寫入、重試、migration、清資料、推送及部署均未執行；沒有開啟 LINE、沒有操作正式站。

## 版本與衝突

- 工作區：`/workspace/steamfoot-beauty-production-review`。
- 美業基準：`9d65e0f8c1b246946daa50069cb76561eef7d1ad`，含前輪交接、收費共用表單及既有美業修正。
- 正式程式基準：已固定的 `4efcd72bf513953521665f2556f719d1f73b5e8c`。這是前次確認的版本，未在本輪連網宣稱它仍是遠端最新 HEAD。
- **74 個衝突檔案、209 個文字區段全部處理，未解決衝突為 0。**72 個檔案逐段整合；舊 `spa-db.ts` 與舊 SPA UI 測試保持刪除。
- 這是完整本機 merge；沒有用任一側整份覆蓋全部共用頁面。上游其他可自動合併的檔案亦隨版本納入，不只變更這 74 個檔案。
- 新隔離支線已在 `vercel.json` 禁用自動部署；未推送。

## 分組整合與回歸

| 組別 | 保留與整合內容 | 分組離線結果 |
| --- | --- | --- |
| 收費、購買方案及後端 | 實際共用 `CoursePlanDraftForm`、美業單次／多次收費接點、技師限制與歷史快照、收款對象隔離；音樂教師資格、期數、學費與付款分配；未知儲存結果不能重複送出 | 35 個檔案、295 項通過 |
| 班表、改期、租借、人員 | 美業逐人技師／床位及整理時間；音樂新版顏色、剪貼改期、連續租借；停用資料收合、原版人員編輯及角色權限；美業租借明確使用美業授權與交易接點，不引入每週課等業務 | 51 個檔案、492 項通過 |
| 顧客、報表、提醒、設定 | 美業 source ports、返回狀態、所屬店長及權限；音樂 operational／legacy 資料範圍、帳務查詢、共用顧客／待辦；自助預約開關及 Google Maps 等既有設定接點 | 62 個檔案、422 項通過 |

分組數量範圍有重複，不能相加當驗收總數。加入 runtime／SPA 移除及整合邊界檢查後，**最終去重回歸：160 個測試檔、1,360 項通過**。包含新增的音樂 85 折率輸入相容測試，以及美業報表不落回課程查詢／授課費的整合測試。

本輪修正了整合時暴露的缺漏：共用表單重複變數、新模型必填欄位的美業投影、租借模組識別、顧客匯出參數、設定面板 pending 關閉處理、通知限流引用，以及新版元件所需的測試替身。音樂／運動原有功能測試與美業回歸同時保留。

## 驗證與限制

- TypeScript 全站 noEmit 檢查已通過；最後完整檢查與紀錄見 evidence。
- 衝突及相關異動程式 ESLint：0 錯誤、13 項警告；未將 warning 當成 0。主要為上游未使用宣告及 Hook dependency 提示，保留在證據檔中。
- Git 差異空白檢查、衝突標記檢查通過；SPA runtime／路由移除回歸通過。
- 所有回歸使用 mocked／pure／jsdom 測試，Node 載入 socket 封鎖器；離線產生 Course Prisma Client 使用假 localhost:1 URL，沒有連到資料庫。generated 為本工作區獨立副本。
- 未執行需要資料庫的測試。兩個 subprocess preflight 測試在初跑遇到 sandbox EPERM，未納入最後通過數；明細見 `excluded-checks.json`。未為解決它們放寬環境限制。
- 未跑含自動 migration 的 build。上游既有 migration 檔隨版本整合，不代表已套用；美業六欄位 SQL 仍在待審文件目錄，不移入自動 migration 目錄。
- 未將 jsdom／離線測試說成真實瀏覽器、真實收款或真機驗收；沒有重新拍攝桌機／iPad／手機畫面。

## 統一尚缺項目

1. 另行核對目標隔離庫與正式庫的資料結構、六欄位及既有筆數；正式基礎表安裝與六欄位升級不能混為同一份 SQL。本輪沒有查核遠端資料。
2. 核對備份與還原方式、審查必要升級並取得明確授權；不自動執行。
3. 環境可用且另行授權後，真實登入驗證儲存重開、收款／折扣／退款、方案扣還次、快照改期、單人／兩人／四人、低權限及跨店限制。
4. 對這次整合版本補做桌機、iPad、手機與店家確認；舊版本真機通過不直接套用。
5. 完成上述核對後，再決定是否部署隔離測試站與正式站。**本輪不是可正式上線的核准。**

證據：[逐檔衝突決策](evidence/20261025-production-integration/conflict-resolutions.json)、[最終測試](evidence/20261025-production-integration/final-tests.log)、[去重測試清單](evidence/20261025-production-integration/final-manifest.json)、[未執行項目](evidence/20261025-production-integration/excluded-checks.json)、[型別檢查](evidence/20261025-production-integration/tsc-complete.log)、[Lint](evidence/20261025-production-integration/eslint-final.log)、[機器摘要](evidence/20261025-production-integration/review.json)。
