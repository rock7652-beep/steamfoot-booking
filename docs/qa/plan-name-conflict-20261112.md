# 同名收費誤報缺少店舖

2026-11-12 19:49（台北）使用者在「買吉他」新增「吉他個別課」，畫面提示「缺少店舖資訊」。正式部署 dpl_CqqeMj7Z9vNdDTAK1vLdqpMLhFY6 的 11:49:30 UTC POST /hq/dashboard/settings-save/course/plan 實際為 CoursePointPlan.create 的 storeId／name 唯一限制。正式唯讀查詢確認本店已有同名下架方案：800 元、1 堂。沒有寫入正式資料。

原因：handleActionError 先以錯誤字串是否含 storeId 判為 STORE_MISSING，因而把含該欄位的唯一限制誤報成缺少店舖。記錄器原本的分類則正確為 UNIQUE_VIOLATION。

修正：先依 Prisma P2002／P2003／P2011 區分唯一、外鍵與空值限制；只有明確缺少 storeId 的錯誤才歸缺店。保留 schema drift 與 AppError 的既有處理。收費名稱的指定唯一限制另回傳「已有同名收費方式（含下架），請編輯原方案或更換名稱。」不更改名稱唯一規則，不自動覆寫、恢復或新增另一筆既有方案。

本機 5 檔／69 項通過，涵蓋含 storeId 的錯誤分類、明確缺店、兩種 Prisma constraint metadata、receipt／路由與隔離打包 guard。獨立本機 PostgreSQL 16（127.0.0.1:55436，plan_conflict_test），以實際 Prisma 執行 11 項 course-plan-save.pg 全部通過；新增案例重現同名下架方案被拒、原資料完整不變且沒有第二筆。測試建立隨機 schema 後清除；專用容器已停止移除，沒有使用既有開發或正式資料庫。

沿用真正 CourseMemberWorkspace／CoursePlanDraftForm 的合成 Chromium 驗收，網路及後端寫入封鎖。以失敗回應驗證短錯誤、輸入名稱／800 元保留、店舖識別未遺失、不要求重新登入；1366×900、1024×768、768×1024 無整頁水平溢出與 pageerror。畫面於 artifacts/plan-name-conflict-20261112。這不是登入正式帳號的端到端或實體 iPad 驗收。

入口為 HQ 課程收費的新增／改名，以及共用錯誤分類的其他後台動作。操作情境 06／10：失敗訊息與正確店舖範圍；沒有新增款項、購課、預約、扣堂或通知。無 migration，通知設定與舊課卡保留；精確 Preview 分支仍沿用既有資料庫、來源與通知隔離及打包 guard。最新 TypeScript、lint、遠端 checks、Preview 與發布結果記於 PR。
