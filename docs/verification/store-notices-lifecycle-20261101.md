# 數位管家：3 天最新消息＋7 天歷史訊息

適用蒸足、美業、音樂與運動後台共用面板。訊息發布未滿 72 小時為最新消息，72–240 小時為歷史訊息；滿 240 小時不再顯示。已讀與時間分類互相獨立，新業務異動重新發布，已讀或自動結案不延長期限。全部已讀涵蓋目前門市兩分頁的有效訊息。

候選 SQL 以 `scripts/store-notice-lifecycle-release-review.mjs` 固定第一階段 SQL checksum，受控 managed-service 遷移在同筆交易鎖定三來源並驗證首次保留範圍，安裝後確認所有舊欄位及 Prisma 帳本未變。特殊首次保留是使用者明確決定的一次性回填，不更改原 createdAt。正式營運盤點及備份依據保留於本次工作區，不公開在 repository。

`verifyStoreNoticeLifecycleReadiness` 驗證新增結構精確指紋及有效權限後，原 digital-manager 檢查仍核對既有欄位、索引、約束、政策、函式及角色。沒有將 PGlite 版本差異加入正式 schema allowlist。

發布前 完整版本發布準備曾有 21 個相關測試檔共 146 項通過；第一階段移除刪除功能後另有 20 個測試檔共 145 項及 18 組版面重驗通過；TypeScript、受影響程式 ESLint、語法與 diff 檢查通過。隔離遷移演練確認錯誤範圍會回滾、正確 fixture 保留生效、沒有刪除指令／函式／維護角色且舊資料與 migration 帳本不變。這些不是正式還原成功的證據。

共用 UI fixture 在三種 namespace 各驗證 1366×900、1920×1080、1024×768、768×1024、560×800、390×844，共 18 組 Chromium 模擬尺寸；已讀後保留原列、3 天轉歷史、10 天隱藏、草稿保留及無整頁水平溢出。不是實體 iPad 或完整登入業務驗收。前端未變動時重用這些證據，不重建同版本。

20 萬筆合成資料驗證第一頁採每來源 Limit／Index Scan 再 Merge Append；深頁仍可能 bitmap／sort，不宣稱所有資料量或頁深都有固定延遲。

第一階段只做分類、排序及獨立已讀狀態。自動審核拒絕了原先包含未啟用清理函式及維護角色的版本，因此本次版本完全不安裝那些能力、不新增防重表、不新增清理排程，也不提供清理 API。滿 10 天的訊息僅在畫面隱藏，實體通知仍保留。這是縮小已授權範圍的安全替代方案，不代表刪除已啟用。

第一階段候選：`scripts/sql/store-notice-lifecycle-phase1.sql`，SHA256 `38ef2b8aede9af8a5a863e6db94dd381f9c09dc31f66f8d310c6dae7fd02f12d`；新增結構 fingerprint `27af17e45cc23f72cd85f89b6d5f83fb`。managed-service 單一目標 `store_notice_lifecycle_display_only_20261101` 由受控產生器包上交易內範圍及舊資料不變檢查；不執行一般 Prisma migrate deploy。

正式版本、遷移 ID、部署及唯讀 postflight 應以實際發布證據核對，不以此實作摘要取代。回退優先保留新增 schema、停用清理並回到已確認的前一部署，不以整庫還原覆蓋新的預約與帳務。
