# 通知索引檢查（2026-11-01）

範圍：檢查現有全站通知查詢與索引，非正式資料庫修改。基準 ec4638a0 加上工作區尚未發布的日期倒序／批次已讀變更。

## 結論

已有門市與狀態相關索引，但無法據此保證大量歷史通知的讀取成本固定。每頁 50 筆限制的是回傳量，不是資料庫掃描與排序量。建議維持紀錄，優先針對查詢與索引一起改善，無須以自動刪除訊息解決。

## 全站盤點

| 來源 | 既有定義 | 與新版查詢的差異 |
| --- | --- | --- |
| SteamfootStoreNotice | storeId, handledAt, startsAt | 未包含 createdAt、id 完整排序；已處理為 handledAt IS NOT NULL，並非固定 handledAt，因此不能直接沿用下一欄作全域日期順序 |
| CourseStoreNotice（含音樂／運動及美業） | storeId, handledAt, startsAt | 相同問題；美業另有 subjectKey LIKE 'beauty:%' 範圍 |
| DigitalManagerNotice 待處理 | storeId, createdAt DESC, id，條件 handledAt IS NULL | 新版使用 digital: 前綴 id 且 DESC，與索引末欄／運算式不完全相同；還需篩選事件類型與 eventKey |
| DigitalManagerNotice 已處理 | storeId, handledAt DESC, id，條件 handledAt IS NOT NULL | 已處理索引以處理時間排序，新版依訊息日期排序 |

來源：prisma/schema.prisma、course-prisma/schema.prisma、prisma/migrations/20261011100000_course_store_notice_center、20261021040000_steamfoot_store_notices，以及 scripts/sql/digital-manager-notice-candidate.sql 與 reconciliation 的數位管家定義。這是儲存庫定義，不代表正式環境已安裝相同索引。

三模組共用列表均使用 UNION ALL 合併後 ORDER BY startsAt DESC, createdAt DESC, id DESC，再 OFFSET / LIMIT 51。OFFSET 越深，需要跳過的資料越多。待處理統計使用 count(*) 與 max(updatedAt)，每次仍須處理符合條件的未讀資料；現有索引可縮小門市／狀態範圍，但不是常數時間。清除未讀能減少這部分工作，不能消除已處理列表的排序成本。

「全部標為已讀」成本與待處理筆數、寫入及鎖定時間相關；已讀歷史不會被重複更新，但大量待處理仍可能增加交易時間。不能承諾所有資料量下一次操作都立即完成。

## 隔離查詢計畫驗證

歷史重現程式：`scripts/qa/store-notice-index-audit.mjs`（僅適用生命週期變更前的查詢，現行版本會明確拒絕以免誤用）。新版查詢請執行 `node scripts/qa/store-notice-lifecycle-plan.mjs`，結果見生命週期驗證紀錄。PGlite PostgreSQL 引擎，兩表各 100,000 筆，共 200,000 筆；10 家合成門市，90% 已處理，目標門市兩來源合計 20,000 筆。使用目前蒸足列表及未讀摘要原始 SQL，測試待處理／已處理第一頁及 OFFSET 5000。

現有索引的計畫為 Bitmap Index Scan → Bitmap Heap Scan → Append → Sort → Limit；列表有使用索引縮小範圍，但沒有直接按索引順序取出 51 筆。已處理列表先讀兩來源各 9,000 筆，合併排序後才取一頁。

另在隔離資料庫加入待處理／已處理的部分排序索引（一般通知含完整日期欄位，數位通知含前綴 id 運算式）再重跑。規劃器仍選原索引與 Sort，因此單獨增加這些索引不是已驗證的修復方案，不建議直接發布這組候選索引。完整計畫保存在同目錄 JSON。

毫秒數僅為此單次本機診斷，受快取、WASM 引擎與環境影響，不是正式站延遲、前後改善百分比或容量承諾。未模擬正式 RLS、併發、網路與真實資料分布。音樂／運動／美業僅完成查詢及索引定義盤點，未宣稱完成其正式執行計畫驗證。

## 建議的最小後續

先在隔離環境把每個來源的日期排序與取樣上限放入來源查詢，再合併有限結果；搭配相同範圍與順序的索引，以實際 EXPLAIN 證明掃描量下降，確認跨來源同日期排序、分頁及權限不變。若要讓深頁成本也穩定，再評估游標分頁；不是這次檢查自動新增的功能。未讀摘要另依正式未讀量評估覆蓋索引是否值得，不先加重所有寫入。

本次未變更應用程式、schema、migration、正式索引或正式資料，未部署。正式實際索引與查詢計畫尚待具備該環境唯讀連線時核對；目前環境未提供資料庫憑證。
