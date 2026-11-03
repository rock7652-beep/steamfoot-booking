# 美業唯讀請求重複身分查詢 — 2026-10-26

## 原因與修正

正式 BEAUTY_READ_PERF 最近 24 小時回傳 83 筆樣本（非完整流量統計）。其中出席更新一筆 2218ms，寫入 692.8ms、同步 1524ms；同步內授權 755.4ms、權限 457.3ms。巢狀 span 不可重複加總。版本查詢 63 筆，中位數 568.4ms，授權亦占大部分時間。兩筆公開前台 availability 為 375.8/399.7ms，沒有後台 booking.submit 樣本，不能當成後台改善前後對照。

getCurrentUser 與 getActiveStoreForRead 已支援既有 AsyncLocalStorage request memo，但美業讀取入口未啟用；React cache 在 Route Handler／Server Action 中不能假設一定去重。

這批在清單 GET、時段唯讀查核、寫入完成後清單＋當日班表同步，啟用既有單次唯讀 request memo。只共用本次身分及目前店家查詢結果；每個業務權限、功能、有效店家、顧客範圍、資源／額度查核保留。不包住交易或 booking.submit；寫入完成後另建新讀取 scope。沒有跨請求或持久快取。沒有資料庫、帳務、schema、LINE 設定變更。

## 驗證

- 139 檔、1081 項美業與 read memo 回歸通過。
- 新增實際執行路由與出席同步的 scope 測試：同次並行讀取共用身分，下一請求重查；寫入不共用，寫入後取得全新身分；既有權限拒絕及跨店拒絕保留。
- TypeScript、ESLint、差異檢查通過。
- 沒有操作正式顧客或新增正式預約以製造樣本。正式後台預約耗時及更新後實測仍待自然操作紀錄；不宣稱已縮短為特定秒數。
- 無 UI 變更，無新增桌機／平板／手機版面驗收宣稱。
