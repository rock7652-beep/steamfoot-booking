# 運動永久課訂閱停用後自動展課保護

原問題已於正常登入的本機隔離店重現：CANCELLED 新增6課/6預約，EXPIRED新增7課/7預約。來源為課表讀取直接呼叫 ensureSportsMonth，未經 courseManager 的訂閱寫入檢查。

本次僅修改 sports-permanent-series：ensureSportsMonth 沿用既有 isStoreSubscriptionWriteBlocked，在自動變動資料前略過停用訂閱，保留歷史課表讀取；materializeSportsMonth 在實際展課前再沿用 assertStoreSubscriptionWritable 拒絕寫入。不改全域 guard、店家權限、交易鎖或計費規則。

相同 PostgreSQL16 localhost 隔離資料及正常 OWNER 登入，僅以 GET 讀取未來月份，沒有送出新增排課表單：

|狀態|修正後新增課次|新增預約|
|---|---:|---:|
|ACTIVE，2026-11|6|6|
|CANCELLED，2027-01|0|0|
|EXPIRED，2027-03|0|0|
|恢復ACTIVE，再讀2027-01|6|6|

四組頁面均HTTP200、未出現錯誤頁，EXPIRED仍顯示唯讀提示；原有課次和預約筆數在停用期間不變。月份含課表緩衝天數。

5檔39項測試通過，包括停用跳過資料變動、正常讀取、實際展課前拒絕、正常展課入口、非運動不受影響、既有取消/釋出與子店唯讀回歸。變更檔案ESLint及TypeScript noEmit皆通過。隔離資料還原至原備份並停止服務與容器。

證據 artifacts/sports-subscription-expansion-20261019/before.json、after.json、regression.log。完整本機截圖及執行紀錄 /workspace/sports-subscription-fixed-20261019。沿用前輪嚴格 localhost QA adapter，實際服務檔案與此分支一致；本機fixture以SQL建立，UI採正常登入讀取，非正式環境/真機驗收。不將首次harness缺啟用旗標回滾當作修正前通過。

未更動音樂測試站或正式站，沒有合併、部署或執行正式migration。本輪未處理其他四項疑點。既有訂閱查詢失敗時的全域政策沿用，未擴大調整。

審查分支已於 vercel.json 停用 Git 部署，next.config.ts 與 ci-migrate.mjs 在 Vercel/Workers/Pages 的本分支 metadata 下先拒絕；三項 migration 入口拒絕檢查通過。main 自動部署停用設定保持。
