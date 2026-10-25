# 美業收費升級與正式版本整合審查方案（2026-10-25）

> 後續狀態：本機正式版本整合的 74 個衝突檔案已全部處理，最終 160 個測試檔／1,360 項離線測試通過。以下保留前輪紀錄；最新統一結果與尚缺項目請以 [整合結果](production-integration-review-20261025.md) 為準。資料庫及部署限制未解除。

本文件是本機審查方案，不是資料庫操作或部署指令的執行授權。維持資料庫寫入、重試、migration、清資料與部署停止，LINE 關閉。

## 目前完成與未完成

- 美業交接的獨立收費表單已改成真正呼叫 `CoursePlanDraftForm`；獨立 charge-editor.module.css 已移除。BeautyChargeEditor 現在只提供模組資料、必要欄位與儲存 adapter，不再擁有另一份 form／input／select 標記。
- 體驗價格與分鐘從既有 CourseServicePriceDraftForm 抽成同一 CourseTrialPriceFields，原定價入口與美業共用實際欄位。
- 收費類型與技師限制是 adapter 選用欄位，未傳 charge 的音樂／運動入口保留原分支；不新增點數、開放選課或固定週期等美業未確認的業務。
- 總售價直接傳遞，不乘上方案次數；單次可有體驗價與分鐘，多次方案不顯示體驗欄位。
- 原有售卡及預約規則快照與權限 writer 不變；未知儲存結果沿用共用 receipt、保留草稿及重試確認流程，不能在結果未明時關閉或重複建立。
- 本輪不是全站最新正式版整合完成，也不是線上驗收。獨立收費清單仍在 BeautyChargeWorkspace；這次接回的是表單，不能宣稱整個收費工作台或全站已完全沿用最新版。

## 資料庫層次：不能混為同一份 SQL

| 目標狀態 | 審查與處理 |
| --- | --- |
| 既有隔離測試庫，14 張 Beauty 表存在，六欄全缺 | 先重新核對部署、project、Store ID、權限及實際筆數；再審查既有六欄位 SQL。沒有授權不得套用。 |
| 六欄部分存在或型別／nullable／default 不符 | 停止，不使用 IF NOT EXISTS 掩蓋差異，不重跑或回填。先重新建立精確差異方案。 |
| 六欄已存在且型別相符 | 視為需要核對的既有升級，不宣稱可重跑；比對來源、帳本及程式版本，再進驗收。 |
| 正式庫缺 Beauty 基礎表（10/24 唯讀證據） | 不能跑六欄位 SQL。先審查完整基礎安裝、後續欄位／交易修訂、索引、約束、RLS 與後端角色。Preview 專用安裝 SQL 不可直接轉為正式升級包。 |

六欄：BeautyService.singleChargeName（text）、singlePriceConfigured（boolean）、chargeTechnicianRule（jsonb）；BeautyPlan.chargeTechnicianRule、BeautyCard.chargeRuleSnapshot、BeautyAppointment.chargeRuleSnapshot（均 jsonb）。皆 nullable、無 default。原 SQL 只新增欄位，沒有批次 UPDATE、DELETE 或回填；但 ALTER TABLE 仍需取得表鎖，不能因此說「零影響」。

審查檔案：

- `docs/qa/sql/beauty-release-preflight.readonly.sql`：只讀表／欄位／RLS／policy metadata，不查正式個資。
- `docs/qa/sql/beauty-charge-counts.readonly.sql`：只在四表存在且明確 Store ID 已確認後，統計該店實際筆數；未替換目標時不能拿空結果當零筆。
- `docs/qa/sql/beauty-charge-additive.review.sql`：原六欄位候選，保持原樣，未執行、不在自動 migration 目錄。

本輪沒有執行上述任何 SQL，未重新宣稱遠端環境／筆數已核對。

## 新舊資料及安全回退

1. 舊欄位 SQL NULL 保持 legacy 相容；JSON null、未知版本或損壞快照應拒絕，不能當作不限制技師。
2. 價格與技師限制修改影響新購／新約；既有卡與原預約依自身快照。改期、恢復及時段查詢均須驗證原快照、目前資格及完整服務／整理時間。
3. 新六欄必須在新版 Prisma Client 部署前存在；關閉開關仍不能防止 ORM 讀取完整欄位而出錯。
4. 已有 SELECTED 快照時，可關閉新編輯入口，不能關掉限制或回退到忽略限制的後端；不 DROP 欄位、不清資料、不覆蓋營運交易。
5. 備份只核對既有平台備份的當日可還原點、涵蓋範圍與回復方式；不在本輪新增備份匯出、還原演練或索取憑證。資料庫備份不含 Storage 物件本體。

## 與正式 main 的整合順序

固定核對基準為上次唯讀確認的正式 main `4efcd72bf513953521665f2556f719d1f73b5e8c`，不是對現在遠端最新狀態的再確認。本輪本機 merge 試算仍有 **74 個衝突檔案、209 個文字衝突區段**，已記錄逐檔清單；試算已中止，沒有把未審查合併混進可驗證支線。

分組處理，不整份覆蓋共用檔：

1. 共用模型、course client、財務讀取與音樂來源隔離：保留正式退休資料規則、期間及付款分配，同時保留 Beauty source ports。
2. 收費／購買表單：音樂的教師資格 UI、期數／學費欄位必須與對應 action、validator、query 同包接入；不能只拿新表單接舊 writer。目前已接回的美業 form adapter 留在可驗證基底，尚未宣稱完整接入新版音樂教師流程。
3. 班表、改期／剪貼、租借與人員：保留正式日期／時長／重複課表修正，以及美業技師／床位獨立分配、原快照與權限。
4. 顧客、營運／分析、提醒、匯出與設定：保留正式音樂 dataScope、期間帳務與通知修訂；美業沿 source 注入，不重建頁面。
5. HQ 路由與 retired SPA：保留本輪已修的美業切店，不恢復 SPA 頁面／runtime，不將美業當成 SPA。
6. build／CI／runtime guards：合併兩邊作用域檢查，保留正式音樂 release preflight、美業隔離檢查及通知封鎖。禁止為通過建置刪 guard 或執行 migration。

完整整合仍未完成；這份清單不是 74 個檔案已解決的宣稱。

## 後續驗收範圍

本機：共享表單實際 DOM、一般／體驗／多次欄位、原價／總價、允許技師、錯誤保留、未知回應重試與清單返回；另核對運動／音樂非 charge 分支。

待環境與升級另行確認後：設定儲存重開、售卡快照、單人／兩人／四人預約、不同技師與床位、原快照改期／恢復、扣次與重送、收款折扣／退款、低權限／跨店及當日現金抽屜。新版桌機與 iPad、手機、鍵盤及長名稱均需補驗，不能沿用舊假資料截圖或前輪真機結果。

## 本輪驗證結果

28 個測試檔、216 項 targeted mocked／pure／DOM 測試通過；TypeScript noEmit、5 個異動 TS／TSX 檔 ESLint（零警告）及差異檢查通過。沒有跑包含 migration 的 build。全部程序使用 socket 封鎖器；未連線資料庫。

本輪無可用瀏覽器控制工具，因此未宣稱重新完成桌機／iPad／手機視覺驗收。舊交接截圖不代表這個共用表單的新畫面。

證據：[review.json](evidence/20261025-fee-reuse/review.json)、[測試](evidence/20261025-fee-reuse/tests.log)、[正式版衝突清單](evidence/20261025-fee-reuse/production-conflicts.json)。
