# 美業正式發布前唯讀核對（2026-10-24）

結論：目前尚不適合直接正式發布。前輪四項隔離站 API／帳本驗收仍為通過；本輪確認了版本整合、正式資料結構與現金驗收前置狀態，沒有把待驗收項目標成完成。

## 驗收清單

| 項目 | 結果 | 尚缺內容 |
| --- | --- | --- |
| 設定保存、折扣收款、扣次與恢復 | 前輪已通過 | 詳見實際業務驗收報告，該輪為轉帳記帳而非現金。 |
| 收款小視窗、切換顧客、返回保留搜尋／篩選／捲動 | 未完成瀏覽器實測 | 本輪工具清單沒有 Browser js、雲端 CUA 或對應控制工具；讀過 Browser skill 並搜尋工具後確認。不可使用獨立 Playwright 替代，也不可把 API 讀取當成畫面通過。 |
| 現金抽屜、現金收款及退款 | 前置狀態受阻，未執行成功流程 | 測試店只有 2026-10-21 的 OPEN 抽屜，沒有 CLOSED 抽屜。initialize 拒絕已有紀錄，open 又要求已有 CLOSED 的 finalBookBalance。需先核對舊抽屜應有／實際現金並正常結帳，才可承接新日測試；未擅自結帳其他測試紀錄。 |
| 正式版本核對 | 已完成唯讀檢查，整合尚未完成 | 美業 Preview 與正式 main 分岔；合併試算有 74 個衝突檔案，包含共用收款、班表、顧客及設定。不能用美業舊支線覆蓋已發布共用功能。 |
| 正式庫相容性 | 已完成基礎欄位唯讀比對，不相容 | 正式 public 缺少隔離站 14 張 Beauty 表；171 個 Beauty 欄位因此不存在。尚不可直接開啟新版美業。 |
| 備份與還原方式 | 已核對官方方式；最新可還原點待確認 | 現有紀錄只證明 9/20 曾核對每日備份，不能證明今天的備份。沒有備份讀取工具或已配置的 Management API 憑證；未另索取憑證、未匯出正式資料、未 Restore。 |

手機／平板先前由使用者確認，與上述瀏覽器互動、現金及正式資料結構檢查分開記錄。

## 版本證據

- 美業 Preview：`dpl_GkMWFozXDjjcrffPh937fkVXmCRG`，來源 `c3417ac6937d1b1111e9dcb2ae5a4c59b62a9ffc`；既有 Preview 別名仍指向該部署。
- 正式 `steamfoot.com`：`dpl_HNLehT3jsUdhzzyMd5QLcPBHdb7y`，來源 main `4efcd72bf513953521665f2556f719d1f73b5e8c`，READY。別名目前轉址至 www。
- 拉取 main 後，以 `git merge-tree --write-tree --name-only` 試算：Preview 獨有 128 個提交，正式獨有 237 個提交，74 個衝突檔案。未 merge 分支，未更動產品檔案或部署。
- 音樂／運動與美業共用程式，因此發布整合須保留正式版已上線的其他模組改動；不是要求更改美業業務流程。

## 資料結構證據及界線

只查 information_schema 欄位 metadata，未讀取正式顧客內容。核對範圍為 Beauty*、ShopConfig、Customer、CourseRoom、CashDrawerSession、CashbookEntry：正式 118 欄、Preview 289 欄；共同欄位的 data_type 與 nullable 未發現差異。這不是完整索引、約束、RLS 或後端角色相容性驗證。

缺表：BeautyAppointment、BeautyCard、BeautyCommand、BeautyEvent、BeautyGroup、BeautyLedger、BeautyPayment、BeautyPlan、BeautyPurchase、BeautyService、BeautySetting、BeautySettlement、BeautyTechnician、BeautyTransactionRevision。

目前倉庫存在候選 SQL，但 `beauty-preview-install.sql` 是隔離 Preview 專用，不能直接拿來升級正式庫；正式候選與後續欄位／權限設定需整理成精確的增量發布包並另外審查。本輪沒有套用任何 SQL、migration 或改動資料。

## 備份／回復方式核對

依 Supabase 官方 [Database Backups](https://supabase.com/docs/guides/platform/backups)：每日備份／PITR 須由專案 Backups 顯示實際可還原點；還原會暫停專案存取，資料庫備份不包含 Storage 物件本體。9/20 的舊紀錄不得冒充本日檢查。沒有把新做完整備份匯出或 Docker 還原強加為本輪要求。

應用程式回退與整庫還原需分開：先完成相容性核對，才決定可回退的精確正式版本。不得為回退刪 Beauty 表、刪交易或用舊備份覆蓋後續營運資料。任何正式回復操作仍需明確批准，本輪僅說明方式。

## 後續順序

1. 恢復可用的瀏覽器控制連線，補實際操作驗收；核對舊測試抽屜現金，正常結帳後只用標記資料驗現金收退款。
2. 在隔離發布整合支線保留正式 main 最新改動，逐項解決共用元件衝突並驗證；不直接部署現有美業支線。
3. 整理與正式庫實際狀態相符的美業增量升級／權限方案，確認當日可還原點，再交付精確發布範圍供決定。

本輪沒有新增顧客／預約／交易、沒有關閉舊抽屜、沒有改設定、沒有開啟 LINE、沒有推送或部署。為預備 HTTP 驗收建立的本次一小時 Preview 別名連結未使用並已撤銷。

證據：[唯讀核對 JSON](evidence/20261024-release-readiness/review.json)。前輪：[實際業務驗收](live-business-acceptance-20261024.md)。
