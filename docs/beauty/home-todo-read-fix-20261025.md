# 美業首頁待處理讀取失敗修復（2026-10-25）

## 原因

使用者正式站首頁「今天待處理」顯示讀取失敗。正式 runtime log 確認 dpl_CLJ3aZKzRsu9zpq659nGkHQ5Poie 的 course-home:todos 回報 PostgreSQL 42501：permission denied for table DigitalButlerLead。

getBeautyHomeTodos 將美業付款／服務與共用顧客跟進 UNION 在同一受限 Beauty connection 查詢。該角色本來就沒有 DigitalButlerLead 權限，當登入者有顧客跟進授權時，整個待辦查詢因此失敗；其他首頁統計仍可讀取。

## 修復

- 先保留既有 beautyManager 身分與店家核對，再分別讀取兩個核心。美業付款／服務仍使用受限 beautyPrisma；顧客跟進使用既有 getCourseHomeTodos 共用讀取器，只開 followUp，明確傳遞同一 storeId 與 staffScope。
- 不擴大 Beauty role 的表權限、不修改 RLS、不改 main connection。沒有 SQL GRANT、migration、顧客或交易寫入。
- 兩個來源各取 offset+limit 的前綴，再依日期、id、kind 合併排序，最後才套用全域 offset/limit；計數為兩來源總數之和。不同核心為各自讀取，不聲稱是同一 SQL snapshot。
- 沒有任務權限就不查詢；僅有跟進權限時不使用 Beauty connection；共同來源真的失敗仍呈現既有錯誤，不偽裝成零件待處理。
- 正式建置補上主連線對 DigitalButlerLead 必要欄位的 READ ONLY／LIMIT 0 查詢，無回傳顧客資料。未通過則停止發布，診斷只輸出允許的 stage／code／SQLSTATE。
- 已先 fast-forward 納入正式 main c0cadb65（新運動模組預設與空間操作修復）。回歸發現音樂空間測試仍假設舊版兩段選單，已對齊新版直接「編輯」入口，繼續驗證租借、名額保留與儲存失敗保留；未改音樂或運動 UI。

## 本機驗證

- 177 檔、1,582 項相關回歸通過；另列的 36 項核心檢查包含在相關回歸中，不重複加總。
- 測試涵蓋跨店先阻擋、權限為零不查詢、跟進單獨讀取、受限連線拒絕共用表的模擬、全域分頁與計數、失敗不偽裝零件待辦，以及唯讀 build gate／敏感診斷限制。
- TypeScript noEmit、異動檔 ESLint、git diff --check 通過。本次沒有 JSX／CSS 或介面重新設計。
- 這些本機 mock 不等於正式登入驗收；正式唯讀連線與建置結果待下節補記。

## 發布

候選準備完成，尚待正式 READ ONLY gate、完整建置與網域核對。LINE 保持關閉，既有店家、訂閱、顧客與交易保留。
